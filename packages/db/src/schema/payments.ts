import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    paymentNumber: text('payment_number'),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    businessId: text('business_id'),
    supplierId: text('supplier_id'),
    method: text('method', { enum: ['cash', 'bank_transfer', 'online'] }).notNull(),
    provider: text('provider').notNull().default('payhere'),
    status: text('status', { enum: ['pending', 'confirmed', 'failed', 'cancelled', 'chargeback', 'refunded'] })
      .notNull()
      .default('pending'),
    amountCents: integer('amount_cents').notNull(),
    feeCents: integer('fee_cents').notNull().default(0),
    netCents: integer('net_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    transactionReference: text('transaction_reference'),
    gatewayRef: text('gateway_ref'),
    gatewayPayload: text('gateway_payload'),
    providerReference: text('provider_reference'),
    providerTransactionId: text('provider_transaction_id'),
    idempotencyKey: text('idempotency_key'),
    statusReason: text('status_reason'),
    initiatedAt: integer('initiated_at'),
    authorizedAt: integer('authorized_at'),
    paidAt: integer('paid_at'),
    failedAt: integer('failed_at'),
    cancelledAt: integer('cancelled_at'),
    expiredAt: integer('expired_at'),
    confirmedAt: integer('confirmed_at'),
    confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    poIdx: index('payments_po_idx').on(t.purchaseOrderId),
    idempotencyUq: uniqueIndex('payments_idempotency_uq').on(t.idempotencyKey),
    statusIdx: index('payments_status_idx').on(t.status),
  }),
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
