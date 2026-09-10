import type { Context } from 'hono';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { supplierMembers } from '@vyro/db/schema';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import { notifyAdmins } from '../../notifications/dispatcher';
import type { Env } from '../../../env';
import * as repo from './kycRepository';
import { setSupplierVerification } from '../../suppliers/repository';

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
  const db = getDb(d1);
  const membership = await db
    .select({ supplierId: supplierMembers.supplierId })
    .from(supplierMembers)
    .where(eq(supplierMembers.userId, out.before.userId))
    .limit(1)
    .get();
  if (membership) {
    const mapped = decision === 'approved' ? 'verified' : decision === 'rejected' ? 'rejected' : 'pending';
    await setSupplierVerification(d1, membership.supplierId, mapped as 'verified' | 'rejected' | 'pending');
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
