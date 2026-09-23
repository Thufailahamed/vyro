import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
import { users } from './users';

export const refunds = sqliteTable(
  'refunds',
  {
    id: text('id').primaryKey(),
    refundNumber: text('refund_number'),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    reason: text('reason'),
    status: text('status', { enum: ['requested', 'approved', 'processing', 'completed', 'failed', 'rejected', 'cancelled'] })
      .notNull()
      .default('requested'),
    initiatorType: text('initiator_type').notNull().default('business'),
    refundMethod: text('refund_method'),
    providerReference: text('provider_reference'),
    gatewayRefundId: text('gateway_refund_id'),
    idempotencyKey: text('idempotency_key'),
    feeRefundCents: integer('fee_refund_cents').notNull().default(0),
    commissionReversalCents: integer('commission_reversal_cents').notNull().default(0),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => users.id),
    approvedByUserId: text('approved_by_user_id').references(() => users.id),
    approvedAt: integer('approved_at'),
    rejectionReason: text('rejection_reason'),
    processedAt: integer('processed_at'),
    completedAt: integer('completed_at'),
    failureReason: text('failure_reason'),
    purchaseOrderId: text('purchase_order_id'),
    source: text('source', { enum: ['cancel', 'reject', 'partial_accept', 'return', 'dispute', 'manual'] }),
    sourceRefId: text('source_ref_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    paymentIdx: index('refunds_payment_idx').on(t.paymentId),
    statusIdx: index('refunds_status_idx').on(t.status),
    poIdx: index('refunds_po_idx').on(t.purchaseOrderId),
  }),
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
