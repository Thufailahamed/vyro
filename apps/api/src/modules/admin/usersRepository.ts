import { and, eq, like, lt, or, sql, isNotNull, isNull, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users, sessions, auditLogs, businessMembers, supplierMembers, adminAuditLogs } from '@vyro/db/schema';
import { newId, nowMs } from '@vyro/shared';

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  adminRole: 'super_admin' | 'ops' | 'finance' | 'support' | null;
  isAdmin: boolean;
  status: 'active' | 'suspended';
  membershipsCount: number;
  lastActivityAt: number | null;
  createdAt: number;
};

export async function listAdminUsers(
  d1: D1Database,
  opts: {
    cursor?: string | undefined;
    q?: string | undefined;
    role?: string | undefined;
    isAdmin?: string | undefined;
  },
): Promise<{ items: AdminUserRow[]; nextCursor?: string }> {
  const db = getDb(d1);
  const cond: any[] = [];
  if (opts.cursor) cond.push(lt(users.createdAt, Number(opts.cursor)));
  if (opts.q) cond.push(or(like(users.email, `%${opts.q}%`), like(users.name, `%${opts.q}%`)));
  if (opts.role) cond.push(eq(users.adminRole, opts.role as any));
  if (opts.isAdmin === 'true') cond.push(isNotNull(users.adminRole));
  if (opts.isAdmin === 'false') cond.push(isNull(users.adminRole));

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      adminRole: users.adminRole,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(sql`${users.createdAt} DESC`, sql`${users.id} DESC`)
    .limit(50)
    .all();

  const counts = new Map<string, number>();
  for (const m of await db.select({ userId: businessMembers.userId }).from(businessMembers).all()) {
    counts.set(m.userId, (counts.get(m.userId) ?? 0) + 1);
  }
  for (const m of await db.select({ userId: supplierMembers.userId }).from(supplierMembers).all()) {
    counts.set(m.userId, (counts.get(m.userId) ?? 0) + 1);
  }

  const ids = rows.map((r) => r.id);
  const lastActivity = new Map<string, number>();
  if (ids.length > 0) {
    const activityRows = await db
      .select({ actorId: adminAuditLogs.actorId, maxCreated: sql<number>`MAX(${adminAuditLogs.createdAt})` })
      .from(adminAuditLogs)
      .where(inArray(adminAuditLogs.actorId, ids))
      .groupBy(adminAuditLogs.actorId)
      .all();
    for (const a of activityRows) {
      if (a.actorId) lastActivity.set(a.actorId, Number(a.maxCreated));
    }
  }

  const items: AdminUserRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    phone: r.phone,
    adminRole: (r.adminRole ?? null) as AdminUserRow['adminRole'],
    isAdmin: r.adminRole !== null,
    status: r.status === 'suspended' ? 'suspended' : 'active',
    membershipsCount: counts.get(r.id) ?? 0,
    lastActivityAt: lastActivity.get(r.id) ?? null,
    createdAt: r.createdAt,
  }));

  const last = items[items.length - 1];
  if (items.length === 50 && last) {
    return { items, nextCursor: String(last.createdAt) };
  }
  return { items };
}

export async function setUserStatus(
  d1: D1Database,
  actorUserId: string,
  targetUserId: string,
  status: 'active' | 'suspended',
): Promise<void> {
  const db = getDb(d1);
  const updatedAt = nowMs();
  await db
    .update(users)
    .set({ status, updatedAt })
    .where(eq(users.id, targetUserId))
    .run();
  if (status === 'suspended') {
    await db.delete(sessions).where(eq(sessions.userId, targetUserId)).run();
  }
  await db.insert(auditLogs).values({
    id: newId(),
    actorUserId,
    action: status === 'suspended' ? 'user.suspend' : 'user.unsuspend',
    resourceType: 'user',
    resourceId: targetUserId,
    metadata: null,
    ip: null,
    userAgent: null,
    createdAt: updatedAt,
  }).run();
}

export async function setRequire2fa(
  d1: D1Database,
  targetUserId: string,
  require: boolean,
): Promise<{ before: boolean; after: boolean } | null> {
  const db = getDb(d1);
  const row = (await db.select({ require2fa: users.require2fa }).from(users).where(eq(users.id, targetUserId)).get()) as { require2fa: boolean } | undefined;
  if (!row) return null;
  await db.update(users).set({ require2fa: require, updatedAt: nowMs() }).where(eq(users.id, targetUserId)).run();
  return { before: row.require2fa, after: require };
}
