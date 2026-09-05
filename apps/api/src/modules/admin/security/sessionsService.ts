import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './sessionsRepository';

export async function list(d1: D1Database) {
  return repo.listActiveAdminSessions(d1);
}

export async function revoke(ctx: Context, id: string, adminId: string, reason: string) {
  const d1 = ctx.env.DB as D1Database;
  const out = await repo.revokeSession(d1, id, adminId, reason);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Session not found');
  if (out.before.revokedAt) {
    throw httpError(409, 'CONFLICT', 'Session already revoked');
  }
  await auditAdmin({
    ctx,
    action: 'session.revoke',
    target: { type: 'session', id },
    before: { revokedAt: null },
    after: { revokedAt: out.after.revokedAt, reason },
  });
  return out.after;
}
