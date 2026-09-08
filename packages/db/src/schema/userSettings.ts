import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  preferredCurrency: text('preferred_currency').notNull().default('LKR'),
  notifyOrderUpdates: integer('notify_order_updates').notNull().default(1),
  notifyMessages: integer('notify_messages').notNull().default(1),
  notifyMarketing: integer('notify_marketing').notNull().default(0),
  notifyAiInsights: integer('notify_ai_insights').notNull().default(1),
  twoFactorEnabled: integer('two_factor_enabled').notNull().default(0),
  sessionTimeoutMin: integer('session_timeout_min').notNull().default(1440),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
