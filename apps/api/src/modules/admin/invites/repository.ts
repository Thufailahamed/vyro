import { getDb } from '@vyro/db';
import { adminInvites } from '@vyro/db/schema';
import { and, eq, isNull, gt, lt } from 'drizzle-orm';

export async function createInvite(
  d1: D1Database,
  opts: {
    email: string;
    role: 'super_admin' | 'ops' | 'finance' | 'support';
    tokenHash: string;
    invitedBy: string;
    expiresAt: number;
  },
): Promise<{ id: string; expiresAt: number }> {
  const db = getDb(d1);
  const id = crypto.randomUUID();
  await db
    .insert(adminInvites)
    .values({
      id,
      email: opts.email,
      role: opts.role,
      tokenHash: opts.tokenHash,
      invitedBy: opts.invitedBy,
      expiresAt: opts.expiresAt,
      createdAt: Date.now(),
    })
    .run();
  return { id, expiresAt: opts.expiresAt };
}

export async function findByTokenHash(d1: D1Database, tokenHash: string) {
  const db = getDb(d1);
  return db.select().from(adminInvites).where(eq(adminInvites.tokenHash, tokenHash)).get();
}

export async function markAccepted(d1: D1Database, inviteId: string, _userId: string) {
  const db = getDb(d1);
  await db
    .update(adminInvites)
    .set({ acceptedAt: Date.now() })
    .where(eq(adminInvites.id, inviteId))
    .run();
}

export async function revoke(d1: D1Database, id: string) {
  const db = getDb(d1);
  await db
    .update(adminInvites)
    .set({ revokedAt: Date.now() })
    .where(and(eq(adminInvites.id, id), isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt)))
    .run();
}

export async function listInvites(
  d1: D1Database,
  status?: 'pending' | 'accepted' | 'revoked' | 'expired',
) {
  const db = getDb(d1);
  const now = Date.now();
  if (!status) return db.select().from(adminInvites).all();
  if (status === 'pending') {
    return db
      .select()
      .from(adminInvites)
      .where(and(isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt), gt(adminInvites.expiresAt, now)))
      .all();
  }
  if (status === 'accepted') {
    return db.select().from(adminInvites).where(eq(adminInvites.acceptedAt, adminInvites.acceptedAt)).all();
  }
  if (status === 'revoked') {
    return db.select().from(adminInvites).where(eq(adminInvites.revokedAt, adminInvites.revokedAt)).all();
  }
  // expired: pending invites whose expiresAt <= now
  return db
    .select()
    .from(adminInvites)
    .where(and(isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt), lt(adminInvites.expiresAt, now)))
    .all();
}
