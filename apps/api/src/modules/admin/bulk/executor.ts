import { auditAdminFromDb } from '../lib/audit';
import { newId } from '@vyro/shared';
import { getDb } from '@vyro/db';
import type { Env } from '../../../env';

export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'support';

export type AdminContext = { role: AdminRole; userId: string };

export type BulkEntity = 'users' | 'businesses';
export type BulkAction = 'suspend' | 'unsuspend' | 'role';

export interface BulkActionOptions {
  env: Env;
  ctx: AdminContext;
  entity: BulkEntity;
  action: BulkAction;
  ids: string[];
  /** Per-item function. Throw to fail; return 'noop' for idempotent skip; return 'ok' for success. */
  perItem: (id: string) => Promise<'ok' | 'noop'>;
  /** Optional extras recorded in the summary audit row. */
  extras?: Record<string, unknown>;
}

export type BulkResult = {
  batchId: string;
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; code: string; message: string }>;
};

/**
 * Run a bulk action across `ids`, capturing per-item failures + auditing
 * each attempt under the same `batchId` plus one summary row.
 *
 * Per-item failures are wrapped in a plain object with `.code`/`.message`
 * (matching `httpError` shape) so the route layer can return them as-is.
 *
 * Audit never throws — a failed audit insert is logged and swallowed.
 */
export async function bulkAction(opts: BulkActionOptions): Promise<BulkResult> {
  const unique = [...new Set(opts.ids.filter(Boolean))];
  const batchId = newId();
  const succeeded: string[] = [];
  const failed: Array<{ id: string; code: string; message: string }> = [];

  for (const id of unique) {
    try {
      const r = await opts.perItem(id);
      if (r === 'ok') succeeded.push(id);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      failed.push({
        id,
        code: e.code ?? 'INTERNAL_ERROR',
        message: e.message ?? 'unexpected error',
      });
    }
  }

  const db = getDb(opts.env.DB);

  // Per-item audit rows (success + failed)
  for (const id of succeeded) {
    await auditAdminFromDb({
      db,
      actorUserId: opts.ctx.userId,
      action: `${opts.entity}.${opts.action}`,
      target: { type: opts.entity, id },
      metadata: { batchId },
    });
  }
  for (const f of failed) {
    await auditAdminFromDb({
      db,
      actorUserId: opts.ctx.userId,
      action: `${opts.entity}.${opts.action}.failed`,
      target: { type: opts.entity, id: f.id },
      metadata: { batchId, code: f.code, message: f.message },
    });
  }

  // Summary audit row
  await auditAdminFromDb({
    db,
    actorUserId: opts.ctx.userId,
    action: 'bulk.batch',
    target: { type: 'batch', id: batchId },
    metadata: {
      entity: opts.entity,
      action: opts.action,
      total: unique.length,
      succeeded: succeeded.length,
      failed: failed.length,
      ...(opts.extras ?? {}),
    },
  });

  return { batchId, total: unique.length, succeeded, failed };
}
