import { getDb } from '@vyro/db';
import { adminImpersonations } from '@vyro/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type ImpersonationRow = {
  id: string;
  adminUserId: string;
  targetUserId: string;
  reason: string;
  startedAt: number;
  endedAt: number | null;
  ip: string | null;
  userAgent: string | null;
};

export async function start(
  d1: D1Database,
  body: {
    adminUserId: string;
    targetUserId: string;
    reason: string;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<ImpersonationRow> {
  const row: ImpersonationRow = {
    id: randomUUID(),
    adminUserId: body.adminUserId,
    targetUserId: body.targetUserId,
    reason: body.reason,
    startedAt: Date.now(),
    endedAt: null,
    ip: body.ip,
    userAgent: body.userAgent,
  };
  await getDb(d1).insert(adminImpersonations).values(row).run();
  return row;
}

export async function findActive(
  d1: D1Database,
  adminUserId: string,
): Promise<ImpersonationRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(adminImpersonations)
    .where(eq(adminImpersonations.adminUserId, adminUserId))
    .all())
    .filter((r: any) => r.endedAt === null)
    .sort((a: any, b: any) => b.startedAt - a.startedAt)[0] as ImpersonationRow | undefined;
  return row ?? null;
}

export async function end(
  d1: D1Database,
  id: string,
): Promise<ImpersonationRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(adminImpersonations)
    .where(eq(adminImpersonations.id, id))
    .get()) as ImpersonationRow | undefined;
  if (!row) return null;
  if (row.endedAt) return row;
  const endedAt = Date.now();
  await getDb(d1)
    .update(adminImpersonations)
    .set({ endedAt })
    .where(eq(adminImpersonations.id, id))
    .run();
  return { ...row, endedAt };
}
