import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { categories } from './categories';

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    brand: text('brand'),
    unit: text('unit').notNull(),
    packSize: text('pack_size'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    categoryIdx: index('products_category_idx').on(t.categoryId),
    nameIdx: index('products_name_idx').on(t.name),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
