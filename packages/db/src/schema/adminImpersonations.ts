import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const adminImpersonations = sqliteTable(
  'admin_impersonations',
  {
    id: text('id').primaryKey(),
    adminUserId: text('admin_user_id')
      .notNull()
      .references(() => users.id),
    targetUserId: text('target_user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => ({
    adminIdx: index('admin_impersonations_admin_idx').on(t.adminUserId),
    targetIdx: index('admin_impersonations_target_idx').on(t.targetUserId),
  }),
);

export type AdminImpersonation = typeof adminImpersonations.$inferSelect;
export type NewAdminImpersonation = typeof adminImpersonations.$inferInsert;
