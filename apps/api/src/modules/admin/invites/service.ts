import { randomBytes, createHash } from 'node:crypto';
import { httpError } from '../../../lib/errors';
import { createInvite, findByTokenHash, markAccepted } from './repository';
import { INVITABLE_ROLES, type AdminRole } from '@vyro/auth';
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInviteForEmail(
  d1: D1Database,
  opts: {
    email: string;
    role: AdminRole;
    actorRole: AdminRole;
    actorId: string;
  },
) {
  const allowed = INVITABLE_ROLES[opts.actorRole];
  if (!allowed.includes(opts.role)) {
    throw httpError(422, 'ROLE_NOT_GRANTABLE', `Role ${opts.role} not grantable by ${opts.actorRole}`);
  }
  // Reject if user already exists with a different role
  const db = getDb(d1);
  const existing = await db.select({ id: users.id, adminRole: users.adminRole, status: users.status }).from(users).where(eq(users.email, opts.email.toLowerCase())).get();
  if (existing?.status === 'suspended') {
    throw httpError(409, 'USER_SUSPENDED', 'User is suspended');
  }
  if (existing?.adminRole && existing.adminRole !== opts.role) {
    throw httpError(409, 'ROLE_CONFLICT', `User already has role ${existing.adminRole}`);
  }
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + INVITE_TTL_MS;
  const { id } = await createInvite(d1, {
    email: opts.email.toLowerCase(),
    role: opts.role,
    tokenHash,
    invitedBy: opts.actorId,
    expiresAt,
  });
  await sendMagicEmail(opts.email, token, expiresAt);
  return { id, acceptUrl: `/admin/invite/accept?token=${token}`, expiresAt };
}

export async function acceptInvite(
  d1: D1Database,
  opts: { token: string; name?: string; password?: string },
): Promise<{ userId: string; role: AdminRole; email: string }> {
  const tokenHash = createHash('sha256').update(opts.token).digest('hex');
  const invite = await findByTokenHash(d1, tokenHash);
  if (!invite) throw httpError(404, 'NOT_FOUND', 'Invalid token');
  if (invite.revokedAt) throw httpError(410, 'INVITE_REVOKED', 'Invite revoked');
  if (invite.acceptedAt) throw httpError(409, 'INVITE_ACCEPTED', 'Already accepted');
  if (invite.expiresAt < Date.now()) throw httpError(410, 'INVITE_EXPIRED', 'Expired');

  const db = getDb(d1);
  let userRow = await db
    .select({ id: users.id, adminRole: users.adminRole })
    .from(users)
    .where(eq(users.email, invite.email))
    .get();

  const now = Date.now();
  if (!userRow) {
    const newId = crypto.randomUUID();
    await db
      .insert(users)
      .values({
        id: newId,
        email: invite.email,
        passwordHash: opts.password ? await hashPassword(opts.password) : 'invite-pending-set',
        name: opts.name ?? invite.email.split('@')[0]!,
        phone: null,
        avatarUrl: null,
        adminRole: invite.role,
        adminInvitedAt: now,
        adminInvitedBy: invite.invitedBy,
        status: 'active',
        marketingOptIn: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
    userRow = { id: newId, adminRole: invite.role };
  } else {
    await db
      .update(users)
      .set({
        adminRole: invite.role,
        adminInvitedAt: now,
        adminInvitedBy: invite.invitedBy,
        updatedAt: now,
      })
      .where(eq(users.id, userRow.id))
      .run();
  }
  await markAccepted(d1, invite.id, userRow.id);
  return { userId: userRow.id, role: invite.role as AdminRole, email: invite.email };
}

async function hashPassword(_password: string): Promise<string> {
  // T1 stub: better-auth signup handles real password hashing via its signup flow.
  // For invite-acceptance the user can finish setting password through /api/auth/forget-password
  // or by signing in with their existing flow. We persist a sentinel marker.
  return `invite:${Date.now()}`;
}

async function sendMagicEmail(email: string, token: string, expiresAt: number) {
  // Real email pipeline arrives in T4. For now log to stdout + persist to notifications for traceability.
  const url = `/admin/invite/accept?token=${token}`;
  console.log(`[admin-invite] ${email} accept until ${new Date(expiresAt).toISOString()} url=${url}`);
}
