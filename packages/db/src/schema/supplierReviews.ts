import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';
import { purchaseOrders } from './purchaseOrders';
import { businesses } from './businesses';

export const supplierReviews = sqliteTable(
  'supplier_reviews',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    orderId: text('order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    buyerBusinessId: text('buyer_business_id')
      .notNull()
      .references(() => businesses.id),
    rating: integer('rating').notNull(),
    body: text('body').notNull(),
    status: text('status', {
      enum: ['published', 'hidden_by_flag', 'hidden_by_dispute', 'removed_by_admin'],
    })
      .notNull()
      .default('published'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    uniqPerOrder: uniqueIndex('supplier_reviews_supplier_order_uniq').on(t.supplierId, t.orderId),
    listIdx: index('supplier_reviews_supplier_status_created_idx').on(t.supplierId, t.status, t.createdAt),
  }),
);

export type SupplierReview = typeof supplierReviews.$inferSelect;
export type NewSupplierReview = typeof supplierReviews.$inferInsert;