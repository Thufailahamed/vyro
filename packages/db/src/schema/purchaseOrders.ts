import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { suppliers } from './suppliers';
import { users } from './users';

export const purchaseOrders = sqliteTable(
  'purchase_orders',
  {
    id: text('id').primaryKey(),
    poNumber: text('po_number').notNull(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    status: text('status').notNull().default('pending'),
    subtotalCents: integer('subtotal_cents').notNull(),
    deliveryFeeCents: integer('delivery_fee_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    deliveryAddress: text('delivery_address').notNull(),
    deliveryCity: text('delivery_city').notNull(),
    deliveryDistrict: text('delivery_district').notNull(),
    notes: text('notes'),
    rejectionReason: text('rejection_reason'),
    cancelledReason: text('cancelled_reason'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    acceptedAt: integer('accepted_at'),
    rejectedAt: integer('rejected_at'),
    preparedAt: integer('prepared_at'),
    readyAt: integer('ready_at'),
    dispatchedAt: integer('dispatched_at'),
    deliveredAt: integer('delivered_at'),
    completedAt: integer('completed_at'),
    cancelledAt: integer('cancelled_at'),
    // Inventory lifecycle stamps — make reserve/release/commit idempotent.
    stockReservedAt: integer('stock_reserved_at'),
    stockReleasedAt: integer('stock_released_at'),
    stockCommittedAt: integer('stock_committed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    poNumberUniq: uniqueIndex('purchase_orders_po_number_uniq').on(t.poNumber),
    businessStatusIdx: index('po_business_status_idx').on(t.businessId, t.status),
    supplierStatusIdx: index('po_supplier_status_idx').on(t.supplierId, t.status),
  }),
);

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
