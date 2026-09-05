import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './impersonationRepository';

export async function start(
  ctx: Context,
  adminUserId: string,
  targetUserId: string,
  reason: string,
) {
  if (adminUserId === targetUserId) {
    throw httpError(400, 'VALIDATION_ERROR', 'Cannot impersonate self');
  }
  const d1 = ctx.env.DB as D1Database;
  const existing = await repo.findActive(d1, adminUserId);
  if (existing) {
    throw httpError(409, 'CONFLICT', 'Already impersonating — end current session first');
  }
  const row = await repo.start(d1, {
    adminUserId,
    targetUserId,
    reason,
    ip: null,
    userAgent: null,
  });
  await auditAdmin({
    ctx,
    action: 'impersonation.start',
    target: { type: 'user', id: targetUserId },
    after: { impersonationId: row.id, reason },
  });
  return row;
}

export async function end(ctx: Context, adminUserId: string) {
  const d1 = ctx.env.DB as D1Database;
  const active = await repo.findActive(d1, adminUserId);
  if (!active) throw httpError(404, 'NOT_FOUND', 'No active impersonation');
  const ended = await repo.end(d1, active.id);
  if (!ended) throw httpError(404, 'NOT_FOUND', 'Impersonation not found');
  await auditAdmin({
    ctx,
    action: 'impersonation.end',
    target: { type: 'user', id: active.targetUserId },
    after: { impersonationId: active.id, endedAt: ended.endedAt },
  });
  return ended;
}

export async function current(d1: D1Database, adminUserId: string) {
  return repo.findActive(d1, adminUserId);
}
