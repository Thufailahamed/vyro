import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { supplierProducts } from './supplierProducts';

export const purchaseOrderItems = sqliteTable('purchase_order_items', {
  id: text('id').primaryKey(),
  purchaseOrderId: text('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id),
  supplierProductId: text('supplier_product_id')
    .notNull()
    .references(() => supplierProducts.id),
  productNameSnapshot: text('product_name_snapshot').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  unitPriceCentsSnapshot: integer('unit_price_cents_snapshot').notNull().default(0),
  discountPctSnapshot: integer('discount_pct_snapshot').notNull().default(0),
  quantity: integer('quantity').notNull(),
  lineTotalCents: integer('line_total_cents').notNull(),
});

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
