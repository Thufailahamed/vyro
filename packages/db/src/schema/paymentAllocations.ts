import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
import { suppliers } from './suppliers';

/**
 * Payment allocations (spec §13). Preserves the per-supplier split of a
 * payment so multi-supplier carts never collapse into a single supplier.
 * Shares are computed with integer allocateCents() and always sum exactly
 * to the payment amount.
 */
export const paymentAllocations = sqliteTable(
  'payment_allocations',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    purchaseOrderId: text('purchase_order_id'),
    grossCents: integer('gross_cents').notNull(),
    commissionCents: integer('commission_cents').notNull().default(0),
    commissionBps: integer('commission_bps').notNull().default(0),
    feeCents: integer('fee_cents').notNull().default(0),
    netCents: integer('net_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    paymentIdx: index('payment_allocations_payment_idx').on(t.paymentId),
    supplierIdx: index('payment_allocations_supplier_idx').on(t.supplierId),
  }),
);

export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type NewPaymentAllocation = typeof paymentAllocations.$inferInsert;
