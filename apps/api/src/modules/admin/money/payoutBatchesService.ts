import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './payoutBatchesRepository';

export async function listQueue(d1: D1Database, opts: { cursor?: string; limit?: number }) {
  return repo.listPendingBatches(d1, opts);
}

export async function createBatch(
  ctx: Context,
  opts: { note?: string | undefined; supplierIds?: string[] | undefined },
) {
  const d1 = ctx.env.DB as D1Database;
  const id = randomUUID();
  const totalCents = await repo.pendingPayoutTotalCents(d1);
  const batch = await repo.createBatch(d1, {
    id,
    createdBy: 'admin',
    note: opts.note ?? null,
    totalCents,
  });
  await auditAdmin({
    ctx,
    action: 'payout.batch.create',
    target: { type: 'payout_batch', id },
    after: { totalCents, supplierIds: opts.supplierIds ?? [] },
  });
  return batch;
}

export async function approveBatch(ctx: Context, batchId: string) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getBatch(d1, batchId);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Batch not found');
  if (before.status !== 'pending') {
    throw httpError(409, 'BATCH_ALREADY_APPROVED', `Batch is ${before.status}`);
  }
  const out = await repo.approveBatch(d1, batchId, 'admin');
  if (!out) throw httpError(404, 'NOT_FOUND', 'Batch not found');
  await auditAdmin({
    ctx,
    action: 'payout.approve',
    target: { type: 'payout_batch', id: batchId },
    before: out.before,
    after: out.after,
  });
  return out.after;
}
