import { and, desc, asc, eq, isNull, sql, inArray, type SQL } from 'drizzle-orm';
import { notifications, users } from '@vyro/db/schema';
import type { AdminAlertSeverity } from '@vyro/shared';
import type { AdminRole } from '@vyro/auth';

export type AdminNotificationRow = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: number | null;
  severity: AdminAlertSeverity;
  sourceRef: string | null;
  createdAt: number;
};

export type InboxFilters = {
  severity?: AdminAlertSeverity[];
  category?: string;
  unreadOnly?: boolean;
  sort?: 'createdAt-desc' | 'createdAt-asc';
};

function decodeCursor(c: string): { createdAt: number; id: string } | null {
  try {
    const [tsStr, id] = Buffer.from(c, 'base64url').toString('utf8').split(':');
    if (!tsStr || !id) return null;
    return { createdAt: Number(tsStr), id };
  } catch { return null; }
}

export async function listInbox(
  db: ReturnType<typeof import('@vyro/db').getDb>,
  role: AdminRole,
  userId: string,
  f: InboxFilters,
  cursor?: string,
  limit = 50,
): Promise<{ rows: AdminNotificationRow[]; nextCursor: string | null }> {
  // Scope: this admin's role AND this admin's userId
  // (so super_admin's row only visible to themselves even though others in same role exist)
  const conds: SQL[] = [
    eq(notifications.recipientRole, role),
    eq(notifications.userId, userId),
  ];
  if (f.unreadOnly) conds.push(isNull(notifications.readAt));
  if (f.severity?.length) conds.push(inArray(notifications.severity, f.severity as readonly AdminAlertSeverity[]));
  if (f.category) conds.push(eq(notifications.type, f.category));
  const cur = cursor ? decodeCursor(cursor) : null;
  const dir = f.sort === 'createdAt-asc' ? asc : desc;

  const all = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      severity: notifications.severity,
      sourceRef: notifications.sourceRef,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(...conds))
    .orderBy(dir(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1)
    .all();

  const rows = all.slice(0, limit) as AdminNotificationRow[];
  const next = all.length > limit && rows.length > 0
    ? Buffer.from(`${rows[rows.length - 1]!.createdAt}:${rows[rows.length - 1]!.id}`).toString('base64url')
    : null;
  return { rows, nextCursor: next };
}

export async function unreadCount(
  db: ReturnType<typeof import('@vyro/db').getDb>,
  role: AdminRole,
  userId: string,
): Promise<number> {
  const row = await db
    .select({ c: sql<number>`count(*)` })
    .from(notifications)
    .where(and(
      eq(notifications.recipientRole, role),
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
    ))
    .get();
  return Number(row?.c ?? 0);
}

export async function markRead(
  db: ReturnType<typeof import('@vyro/db').getDb>,
  id: string,
  role: AdminRole,
  userId: string,
): Promise<boolean> {
  const res = await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(and(
      eq(notifications.id, id),
      eq(notifications.recipientRole, role),
      eq(notifications.userId, userId),
    ))
    .returning({ id: notifications.id })
    .all();
  return res.length > 0;
}

export async function markAllRead(
  db: ReturnType<typeof import('@vyro/db').getDb>,
  role: AdminRole,
  userId: string,
): Promise<number> {
  const res = await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(and(
      eq(notifications.recipientRole, role),
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
    ))
    .returning({ id: notifications.id })
    .all();
  return res.length;
}

// re-export users for callers (not used currently)
export { users };
