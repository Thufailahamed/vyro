import { getDb } from '@vyro/db';
import { sessions, users } from '@vyro/db/schema';
import { and, eq, gt, isNull, desc } from 'drizzle-orm';

export type SessionRow = {
  id: string;
  userId: string;
  expiresAt: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  revokedAt: number | null;
  userEmail: string | null;
  userRole: string | null;
};

export async function listActiveAdminSessions(d1: D1Database): Promise<SessionRow[]> {
  const db = getDb(d1);
  const now = Date.now();
  const rows = (await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      revokedAt: sessions.revokedAt,
      email: users.email,
      adminRole: users.adminRole,
    })
    .from(sessions)
    .leftJoin(users, eq(users.id, sessions.userId))
    .where(and(gt(sessions.expiresAt, now), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.createdAt))
    .all()) as Array<{
    id: string;
    userId: string;
    expiresAt: number;
    ip: string | null;
    userAgent: string | null;
    createdAt: number;
    revokedAt: number | null;
    email: string | null;
    adminRole: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    expiresAt: r.expiresAt,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
    revokedAt: r.revokedAt,
    userEmail: r.email,
    userRole: r.adminRole,
  }));
}

export async function revokeSession(
  d1: D1Database,
  id: string,
  adminId: string,
  reason: string,
): Promise<{ before: SessionRow; after: SessionRow } | null> {
  const before = await getSession(d1, id);
  if (!before) return null;
  const revokedAt = Date.now();
  await getDb(d1)
    .update(sessions)
    .set({ revokedByAdminId: adminId, revokedReason: reason, revokedAt })
    .where(eq(sessions.id, id))
    .run();
  return { before, after: { ...before, revokedAt } };
}

export async function getSession(d1: D1Database, id: string): Promise<SessionRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      revokedAt: sessions.revokedAt,
      email: users.email,
      adminRole: users.adminRole,
    })
    .from(sessions)
    .leftJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get()) as
    | {
        id: string;
        userId: string;
        expiresAt: number;
        ip: string | null;
        userAgent: string | null;
        createdAt: number;
        revokedAt: number | null;
        email: string | null;
        adminRole: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    userEmail: row.email,
    userRole: row.adminRole,
  };
}
