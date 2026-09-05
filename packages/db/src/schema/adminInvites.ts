import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const adminInvites = sqliteTable(
  'admin_invites',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    role: text('role', { enum: ['super_admin', 'ops', 'finance', 'support'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: text('invited_by').notNull().references(() => users.id),
    expiresAt: integer('expires_at').notNull(),
    acceptedAt: integer('accepted_at'),
    revokedAt: integer('revoked_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    emailIdx: index('admin_invites_email_idx').on(t.email),
    pendingIdx: index('admin_invites_pending_idx').on(t.expiresAt),
  }),
);

export type AdminInvite = typeof adminInvites.$inferSelect;
export type NewAdminInvite = typeof adminInvites.$inferInsert;
