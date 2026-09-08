import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { supplierProducts } from './supplierProducts';
import { suppliers } from './suppliers';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

/**
 * Append-only inventory ledger. Every change to `supplier_products.stock_qty`
 * or `.reserved_qty` writes exactly one row here, so stock is auditable and
 * reconcilable against orders.
 */
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    supplierProductId: text('supplier_product_id')
      .notNull()
      .references(() => supplierProducts.id),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    reason: text('reason').notNull(),
    qtyDelta: integer('qty_delta').notNull().default(0),
    reservedDelta: integer('reserved_delta').notNull().default(0),
    stockQtyAfter: integer('stock_qty_after').notNull(),
    reservedQtyAfter: integer('reserved_qty_after').notNull(),
    purchaseOrderId: text('purchase_order_id').references(() => purchaseOrders.id),
    actorUserId: text('actor_user_id').references(() => users.id),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    offerIdx: index('stock_movements_offer_idx').on(t.supplierProductId, t.createdAt),
    supplierIdx: index('stock_movements_supplier_idx').on(t.supplierId, t.createdAt),
    poIdx: index('stock_movements_po_idx').on(t.purchaseOrderId),
  }),
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
