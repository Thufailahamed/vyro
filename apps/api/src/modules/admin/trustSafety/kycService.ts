import type { Context } from 'hono';
import { randomUUID } from 'crypto';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './kycRepository';

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
  await auditAdmin({
    ctx,
    action: `kyc.${decision}`,
    target: { type: 'kyc', id },
    before: { status: out.before.status },
    after: { status: out.after.status, notes: out.after.notes },
  });
  return out.after;
}
