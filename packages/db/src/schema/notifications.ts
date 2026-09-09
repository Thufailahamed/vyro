import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    recipientRole: text('recipient_role'),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    readAt: integer('read_at'),
    link: text('link'),
    source: text('source', { enum: ['system', 'ai', 'admin'] }).notNull().default('system'),
    sourceRef: text('source_ref'),
    severity: text('severity', { enum: ['info', 'warning', 'critical'] }).notNull().default('info'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    userReadIdx: index('notifications_user_read_idx').on(t.userId, t.readAt),
    sourceIdx: index('notifications_source_idx').on(t.userId, t.source, t.readAt),
    recipientRoleUnreadIdx: index('notifications_recipient_role_unread_idx').on(
      t.recipientRole, t.readAt, t.createdAt,
    ),
  }),
);

export type Notification = typeof notifications.$inferSelect;
