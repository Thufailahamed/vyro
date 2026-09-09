import type { Context } from 'hono';
import { adminAuditLogs } from '@vyro/db/schema';
import { getDb } from '@vyro/db';
import { randomUUID } from 'node:crypto';

type AuditTarget = { type: string; id: string };

export async function auditAdmin(opts: {
  ctx: Context;
  action: string;
  target: AuditTarget;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const c = opts.ctx;
    const ctx = c.get('ctx') as { userId: string } | undefined;
    if (!ctx) return;
    const requestId = (c.get('requestId') as string | undefined) ?? 'unknown';
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? null;
    const userAgent = c.req.header('user-agent') ?? null;
    const db = getDb(c.env.DB as D1Database);
    await db
      .insert(adminAuditLogs)
      .values({
        id: randomUUID(),
        actorId: ctx.userId,
        action: opts.action,
        targetType: opts.target.type,
        targetId: opts.target.id,
        before: opts.before === undefined ? null : JSON.stringify(opts.before),
        after: opts.after === undefined ? null : JSON.stringify(opts.after),
        requestId,
        ip,
        userAgent,
        createdAt: Date.now(),
      })
      .run();
  } catch (err) {
    console.error('[auditAdmin] failed', err);
  }
}

/**
 * Context-free audit for triggers fired outside an HTTP request
 * (cron jobs, queue DLQ hooks, dispatcher). Uses the same admin_audit_logs
 * table. Skipped when actorUserId is null (system-triggered) since
 * adminAuditLogs.actorId is NOT NULL by design.
 */
export async function auditAdminFromDb(opts: {
  db: ReturnType<typeof getDb>;
  actorUserId?: string | null;
  action: string;
  target: AuditTarget;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!opts.actorUserId) {
    console.warn('[auditAdminFromDb] skipped (no actorUserId)', opts.action, opts.target);
    return;
  }
  try {
    await opts.db
      .insert(adminAuditLogs)
      .values({
        id: randomUUID(),
        actorId: opts.actorUserId,
        action: opts.action,
        targetType: opts.target.type,
        targetId: opts.target.id,
        before: null,
        after: opts.metadata === undefined ? null : JSON.stringify(opts.metadata),
        requestId: '',
        ip: null,
        userAgent: null,
        createdAt: Date.now(),
      })
      .run();
  } catch (err) {
    console.error('[auditAdminFromDb] failed', err);
  }
}

