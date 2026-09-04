import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

export const carts = sqliteTable(
  'carts',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    status: text('status', { enum: ['open', 'converted'] }).notNull().default('open'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ businessIdx: index('carts_business_idx').on(t.businessId) }),
);

export type Cart = typeof carts.$inferSelect;
