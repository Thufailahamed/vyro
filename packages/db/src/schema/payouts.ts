import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';
import { users } from './users';

export const payouts = sqliteTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    payoutNumber: text('payout_number'),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    settlementId: text('settlement_id'),
    amountCents: integer('amount_cents').notNull(),
    feeCents: integer('fee_cents').notNull().default(0),
    netCents: integer('net_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    status: text('status', { enum: ['pending', 'processing', 'paid', 'failed'] })
      .notNull()
      .default('pending'),
    periodStart: integer('period_start').notNull(),
    periodEnd: integer('period_end').notNull(),
    method: text('method', { enum: ['bank', 'cash'] }).notNull(),
    reference: text('reference'),
    externalReference: text('external_reference'),
    bankAccountId: text('bank_account_id'),
    batchId: text('batch_id'),
    idempotencyKey: text('idempotency_key'),
    initiatedByUserId: text('initiated_by_user_id').references(() => users.id),
    approvedByUserId: text('approved_by_user_id').references(() => users.id),
    approvedAt: integer('approved_at'),
    processedAt: integer('processed_at'),
    completedAt: integer('completed_at'),
    paidAt: integer('paid_at'),
    paidByUserId: text('paid_by_user_id').references(() => users.id),
    failureReason: text('failure_reason'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    supplierStatusIdx: index('payouts_supplier_status_idx').on(t.supplierId, t.status),
    periodUq: uniqueIndex('payouts_period_uq').on(t.supplierId, t.periodStart, t.periodEnd),
  }),
);

export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
