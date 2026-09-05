import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './dataExportRepository';

export async function request(ctx: Context, userId: string, requestedBy: string) {
  const d1 = ctx.env.DB as D1Database;
  const row = await repo.create(d1, { userId, requestedBy });
  await auditAdmin({
    ctx,
    action: 'data_export.create',
    target: { type: 'user', id: userId },
    after: { exportId: row.id, status: row.status },
  });
  // Simulate async processing — flip to ready after a short delay in real impl.
  // For testability, leave as 'pending'; a worker would update.
  return row;
}

export async function status(d1: D1Database, id: string) {
  const row = await repo.getExport(d1, id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Export not found');
  return row;
}
