import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const countries = sqliteTable('countries', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  isSanctioned: integer('is_sanctioned', { mode: 'boolean' }).notNull().default(false),
  fxJurisdiction: text('fx_jurisdiction').notNull().default('INTL'),
});

export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;