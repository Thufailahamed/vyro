import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({ slugUniq: uniqueIndex('categories_slug_uniq').on(t.slug) }),
);

export type Category = typeof categories.$inferSelect;
