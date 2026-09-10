import type { Context } from 'hono';
import { randomUUID } from 'crypto';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import { notifyAdmins, notifySupplierOrg, notifyUsers } from '../../notifications/dispatcher';
import type { Env } from '../../../env';
import * as repo from './kycRepository';
import { findSupplierIdByMemberUserId, setSupplierVerification } from '../../suppliers/repository';

export async function list(
  d1: D1Database,
  opts: {
    status?: 'pending' | 'approved' | 'rejected' | 'needs_more_info' | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
) {
  return repo.listKyc(d1, opts);
}

export async function get(d1: D1Database, id: string) {
  const row = await repo.getKyc(d1, id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'KYC review not found');
  return row;
}

export async function create(ctx: Context, body: { userId: string; documentsJson?: string }) {
  const d1 = ctx.env.DB as D1Database;
  const row = await repo.createKyc(d1, {
    id: randomUUID(),
    userId: body.userId,
    documentsJson: body.documentsJson ?? null,
    createdAt: Date.now(),
  });
  await auditAdmin({
    ctx,
    action: 'kyc.create',
    target: { type: 'kyc', id: row.id },
    after: { userId: row.userId },
  });
  await notifyAdmins(ctx.env as unknown as Env, {
    role: 'support',
    severity: 'info',
    category: 'admin_alert',
    title: `KYC review queued: ${row.id.slice(0, 8)}`,
    body: `New KYC review for user ${row.userId} needs decision.`,
    link: `/admin/trust-safety?kyc=${row.id}`,
    sourceRef: `kyc:${row.id}`,
    actorUserId: ctx.get('ctx')?.userId ?? null,
  });
  return row;
}

export async function decide(
  ctx: Context,
  id: string,
  decision: 'approved' | 'rejected' | 'needs_more_info',
  notes: string | undefined,
) {
  const d1 = ctx.env.DB as D1Database;
  const out = await repo.decideKyc(d1, id, decision, notes ?? null, 'admin');
  if (!out) throw httpError(404, 'NOT_FOUND', 'KYC review not found');
  if (out.before.status !== 'pending') {
    throw httpError(409, 'KYC_NOT_PENDING', `KYC review is ${out.before.status}`);
  }
  const supplierId = await findSupplierIdByMemberUserId(d1, out.before.userId);
  if (supplierId) {
    const mapped = decision === 'approved' ? 'verified' : decision === 'rejected' ? 'rejected' : 'pending';
    await setSupplierVerification(d1, supplierId, mapped as 'verified' | 'rejected' | 'pending');
  }
  const env = ctx.env as unknown as Env;
  const queue = (env as unknown as { NOTIFICATIONS_QUEUE?: never }).NOTIFICATIONS_QUEUE;
  const decisionNotice =
    decision === 'approved'
      ? {
          type: 'supplier.verified',
          title: 'You are verified on Vyro',
          body: 'Good news — your supplier account is now verified on Vyro.',
        }
      : decision === 'rejected'
        ? {
            type: 'supplier.rejected',
            title: 'Verification was rejected',
            body: notes ?? 'Unfortunately we were not able to verify your supplier account.',
          }
        : {
            type: 'supplier.review_required',
            title: 'More information needed',
            body: notes ?? 'We need a little more information before we can verify your account.',
          };
  if (supplierId) {
    await notifySupplierOrg(d1, queue, supplierId, {
      ...decisionNotice,
      link: '/supplier/verification',
    });
  } else {
    await notifyUsers(d1, queue, [out.before.userId], {
      ...decisionNotice,
      link: '/supplier/verification',
    });
  }
  await auditAdmin({
    ctx,
    action: `kyc.${decision}`,
    target: { type: 'kyc', id },
    before: { status: out.before.status },
    after: { status: out.after.status, notes: out.after.notes },
  });
  return out.after;
}
