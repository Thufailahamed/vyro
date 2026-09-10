import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
import { users } from './users';

/**
 * Payment attempts (spec §6). A single payment may be attempted multiple
 * times (e.g. PayHere failed twice, succeeded third). Attempts are append-only
 * history — never overwritten. Essential for reconciliation and debugging.
 */
export const paymentAttempts = sqliteTable(
  'payment_attempts',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    attemptNumber: integer('attempt_number').notNull(),
    provider: text('provider').notNull().default('payhere'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    status: text('status', {
      enum: ['initiated', 'processing', 'authorized', 'paid', 'failed', 'cancelled', 'expired'],
    })
      .notNull()
      .default('initiated'),
    providerReference: text('provider_reference'),
    failureReason: text('failure_reason'),
    metadata: text('metadata'),
    initiatedByUserId: text('initiated_by_user_id').references(() => users.id),
    initiatedAt: integer('initiated_at').notNull(),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    paymentIdx: index('payment_attempts_payment_idx').on(t.paymentId, t.attemptNumber),
    statusIdx: index('payment_attempts_status_idx').on(t.status),
  }),
);

export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;
