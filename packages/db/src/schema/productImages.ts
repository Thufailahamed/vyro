import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { products } from './products';

export const productImages = sqliteTable(
  'product_images',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    r2Key: text('r2_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    altText: text('alt_text'),
  },
  (t) => ({ productIdx: index('product_images_product_idx').on(t.productId) }),
);

export type ProductImage = typeof productImages.$inferSelect;
