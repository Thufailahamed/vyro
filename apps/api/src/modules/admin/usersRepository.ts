import { and, eq, like, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users, sessions, auditLogs, businessMembers, supplierMembers } from '@vyro/db/schema';
import { newId, nowMs } from '@vyro/shared';

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isPlatformAdmin: boolean;
  status: 'active' | 'suspended';
  membershipsCount: number;
  createdAt: number;
};

export async function listAdminUsers(
  d1: D1Database,
  opts: { cursor?: string | undefined; q?: string | undefined; role?: string | undefined },
): Promise<{ items: AdminUserRow[]; nextCursor?: string }> {
  const db = getDb(d1);
  const cond: ReturnType<typeof lt>[] = [] as any;
  if (opts.cursor) cond.push(lt(users.createdAt, Number(opts.cursor)) as any);
  if (opts.q)
    cond.push(
      or(like(users.email, `%${opts.q}%`), like(users.name, `%${opts.q}%`)) as any,
    );
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      isPlatformAdmin: users.isPlatformAdmin,
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

  const items: AdminUserRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    phone: r.phone,
    isPlatformAdmin: Boolean(r.isPlatformAdmin),
    status: r.status === 'suspended' ? 'suspended' : 'active',
    membershipsCount: counts.get(r.id) ?? 0,
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
