import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    readAt: integer('read_at'),
    link: text('link'),
    source: text('source', { enum: ['system', 'ai'] }).notNull().default('system'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    userReadIdx: index('notifications_user_read_idx').on(t.userId, t.readAt),
    sourceIdx: index('notifications_source_idx').on(t.userId, t.source, t.readAt),
  }),
);

export type Notification = typeof notifications.$inferSelect;
