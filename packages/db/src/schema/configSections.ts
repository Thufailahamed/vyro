import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const configSections = sqliteTable('config_sections', {
  section: text('section').primaryKey(),
  valueJson: text('value_json').notNull(),
  version: integer('version').notNull().default(0),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: integer('updated_at').notNull(),
});

export type ConfigSection = typeof configSections.$inferSelect;
export type NewConfigSection = typeof configSections.$inferInsert;
