import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
import { users } from './users';

export const refunds = sqliteTable(
  'refunds',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason'),
    status: text('status', { enum: ['requested', 'processing', 'completed', 'failed'] })
      .notNull()
      .default('requested'),
    gatewayRefundId: text('gateway_refund_id'),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => users.id),
    processedAt: integer('processed_at'),
    failureReason: text('failure_reason'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    paymentIdx: index('refunds_payment_idx').on(t.paymentId),
    statusIdx: index('refunds_status_idx').on(t.status),
  }),
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
