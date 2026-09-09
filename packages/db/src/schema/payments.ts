import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    method: text('method', { enum: ['cash', 'bank_transfer', 'online'] }).notNull(),
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
    idempotencyKey: text('idempotency_key'),
    statusReason: text('status_reason'),
    paidAt: integer('paid_at'),
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
