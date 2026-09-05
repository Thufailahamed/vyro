import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const webhooks = sqliteTable(
  'webhooks',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    eventTypesJson: text('event_types_json').notNull(),
    secret: text('secret').notNull(),
    active: integer('active').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    activeIdx: index('webhooks_active_idx').on(t.active),
  }),
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
