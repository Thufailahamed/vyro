import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailVerifiedAt: integer('email_verified_at'),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    avatarUrl: text('avatar_url'),
    adminRole: text('admin_role', { enum: ['super_admin', 'ops', 'finance', 'support'] }),
    adminInvitedAt: integer('admin_invited_at'),
    adminInvitedBy: text('admin_invited_by'),
    status: text('status', { enum: ['active', 'suspended', 'pending_deletion'] }).notNull().default('active'),
    marketingOptIn: integer('marketing_opt_in', { mode: 'boolean' }).notNull().default(true),
    deletionScheduledFor: integer('deletion_scheduled_for'),
    require2fa: integer('require_2fa', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    adminRoleIdx: index('users_admin_role_idx').on(t.adminRole),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
