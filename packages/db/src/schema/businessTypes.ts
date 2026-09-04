import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const businessTypes = sqliteTable('business_types', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export type BusinessType = typeof businessTypes.$inferSelect;
