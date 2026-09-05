import { getDb } from '@vyro/db';
import { adminAuditLogs, users } from '@vyro/db/schema';
import { and, eq, gte, lte, lt, desc } from 'drizzle-orm';

export async function listAudit(
  d1: D1Database,
  opts: {
    actorId?: string | undefined;
    action?: string | undefined;
    targetType?: string | undefined;
    targetId?: string | undefined;
    from?: number | undefined;
    to?: number | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
) {
  const db = getDb(d1);
  const limit = opts.limit ?? 50;
  const where = and(
    opts.actorId ? eq(adminAuditLogs.actorId, opts.actorId) : undefined,
    opts.action ? eq(adminAuditLogs.action, opts.action) : undefined,
    opts.targetType ? eq(adminAuditLogs.targetType, opts.targetType) : undefined,
    opts.targetId ? eq(adminAuditLogs.targetId, opts.targetId) : undefined,
    opts.from ? gte(adminAuditLogs.createdAt, opts.from) : undefined,
    opts.to ? lte(adminAuditLogs.createdAt, opts.to) : undefined,
    opts.cursor ? lt(adminAuditLogs.createdAt, Number(opts.cursor)) : undefined,
  );
  const rows = await db
    .select({
      id: adminAuditLogs.id,
      actorId: adminAuditLogs.actorId,
      actorEmail: users.email,
      actorRole: users.adminRole,
      action: adminAuditLogs.action,
      targetType: adminAuditLogs.targetType,
      targetId: adminAuditLogs.targetId,
      before: adminAuditLogs.before,
      after: adminAuditLogs.after,
      requestId: adminAuditLogs.requestId,
      ip: adminAuditLogs.ip,
      createdAt: adminAuditLogs.createdAt,
    })
    .from(adminAuditLogs)
    .leftJoin(users, eq(users.id, adminAuditLogs.actorId))
    .where(where)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(entries[entries.length - 1]!.createdAt) : null;
  return { entries, nextCursor };
}

export async function purgeExpired(d1: D1Database, olderThanMs: number): Promise<number> {
  const db = getDb(d1);
  const cutoff = Date.now() - olderThanMs;
  const result = await db
    .delete(adminAuditLogs)
    .where(lte(adminAuditLogs.createdAt, cutoff))
    .run();
  return (result as { rowsAffected?: number }).rowsAffected ?? 0;
}
