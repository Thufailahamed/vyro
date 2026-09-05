import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './chargebacksRepository';

export async function listOpen(d1: D1Database) {
  return repo.listOpen(d1);
}

export async function resolve(
  ctx: Context,
  id: string,
  opts: { notes?: string | undefined; refundId?: string | undefined },
) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getChargeback(d1, id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Chargeback not found');
  if (before.status !== 'open') {
    throw httpError(409, 'CHARGEBACK_RESOLVED', `Chargeback is ${before.status}`);
  }
  const out = await repo.resolveChargeback(
    d1,
    id,
    'admin',
    opts.notes ?? null,
    opts.refundId ?? null,
  );
  if (!out) throw httpError(404, 'NOT_FOUND', 'Chargeback not found');
  await auditAdmin({
    ctx,
    action: 'chargeback.resolve',
    target: { type: 'chargeback', id },
    before: out.before,
    after: out.after,
  });
  return out.after;
}
