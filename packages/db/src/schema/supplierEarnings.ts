import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
import { purchaseOrders } from './purchaseOrders';
import { suppliers } from './suppliers';

/**
 * Supplier earnings (spec §14). One row per paid payment allocation:
 * the explainable breakdown of gross → commission → fees → adjustments →
 * refunds → net. Settlement eligibility is derived from order/refund/dispute
 * state, never stored as a bare balance increment.
 */
export const supplierEarnings = sqliteTable(
  'supplier_earnings',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    allocationId: text('allocation_id'),
    grossCents: integer('gross_cents').notNull(),
    commissionBps: integer('commission_bps').notNull(),
    commissionCents: integer('commission_cents').notNull().default(0),
    deliveryFeeCents: integer('delivery_fee_cents').notNull().default(0),
    processingFeeCents: integer('processing_fee_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    refundCents: integer('refund_cents').notNull().default(0),
    adjustmentCents: integer('adjustment_cents').notNull().default(0),
    netCents: integer('net_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    eligibility: text('eligibility', {
      enum: ['ineligible', 'eligible', 'settled', 'held'],
    })
      .notNull()
      .default('ineligible'),
    heldReason: text('held_reason'),
    settledAt: integer('settled_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    supplierIdx: index('supplier_earnings_supplier_idx').on(t.supplierId, t.eligibility),
    paymentUq: uniqueIndex('supplier_earnings_payment_uq').on(t.paymentId, t.supplierId),
    poIdx: index('supplier_earnings_po_idx').on(t.purchaseOrderId),
  }),
);

export type SupplierEarning = typeof supplierEarnings.$inferSelect;
export type NewSupplierEarning = typeof supplierEarnings.$inferInsert;
