import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import { canTransitionRefund } from '@vyro/shared';
import * as repo from './refundsRepository';
import { settleApprovedRefund } from '../../refunds/executor';
import type { Env } from '../../../env';

export async function listQueue(
  d1: D1Database,
  opts: { cursor?: string | undefined; limit?: number | undefined },
) {
  return repo.listRefundQueue(d1, opts);
}

export async function approve(ctx: Context, id: string) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getRefund(d1, id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  if (before.status !== 'requested') {
    throw httpError(409, 'REFUND_NOT_PENDING', `Refund is ${before.status}`);
  }
  // requested → approved, then the executor actually moves the money:
  // gateway refund for online payments, ledger + payment + earning
  // settlement for offline ones (spec §35). Single audit entry preserved.
  if (!canTransitionRefund(before.status, 'approved')) {
    throw httpError(409, 'REFUND_NOT_PENDING', `Refund is ${before.status}`);
  }
  const approved = await repo.setRefundStatus(d1, id, 'approved');
  if (!approved) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  const actor = ctx.get('ctx') as { userId: string } | undefined;
  await settleApprovedRefund(ctx.env as Env, id, actor?.userId ?? 'system');
  const updated = await repo.getRefund(d1, id);
  if (!updated) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  await auditAdmin({
    ctx,
    action: 'refund.approve',
    target: { type: 'refund', id },
    before: { status: before.status },
    after: { status: updated.status },
  });
  return updated;
}

export async function reject(ctx: Context, id: string, reason: string) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getRefund(d1, id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  if (before.status !== 'requested') {
    throw httpError(409, 'REFUND_NOT_PENDING', `Refund is ${before.status}`);
  }
  if (!canTransitionRefund(before.status, 'rejected')) {
    throw httpError(409, 'REFUND_NOT_PENDING', `Refund is ${before.status}`);
  }
  const updated = await repo.setRefundStatus(d1, id, 'rejected');
  if (!updated) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  await auditAdmin({
    ctx,
    action: 'refund.reject',
    target: { type: 'refund', id },
    before: { status: before.status },
    after: { status: updated.status, reason },
  });
  return updated;
}
