import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: integer('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    revokedByAdminId: text('revoked_by_admin_id'),
    revokedReason: text('revoked_reason'),
    revokedAt: integer('revoked_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({ userIdx: index('sessions_user_idx').on(t.userId) }),
);

export type Session = typeof sessions.$inferSelect;
