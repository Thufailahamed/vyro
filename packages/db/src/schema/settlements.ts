import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';
import { supplierEarnings } from './supplierEarnings';
import { users } from './users';

/**
 * Settlements + items (spec §21). A settlement groups eligible earnings;
 * only eligible (completed, undisputed, unrefunded-or-adjusted) earnings are
 * attached. Payouts are created FROM settlements — never from raw balances.
 */
export const settlements = sqliteTable(
  'settlements',
  {
    id: text('id').primaryKey(),
    settlementNumber: text('settlement_number').notNull().unique(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    grossCents: integer('gross_cents').notNull().default(0),
    commissionCents: integer('commission_cents').notNull().default(0),
    refundCents: integer('refund_cents').notNull().default(0),
    adjustmentCents: integer('adjustment_cents').notNull().default(0),
    netCents: integer('net_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    status: text('status', {
      enum: ['pending', 'approved', 'processing', 'completed', 'failed', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    idempotencyKey: text('idempotency_key').unique(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    approvedByUserId: text('approved_by_user_id').references(() => users.id),
    approvedAt: integer('approved_at'),
    processedAt: integer('processed_at'),
    completedAt: integer('completed_at'),
    failureReason: text('failure_reason'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    supplierStatusIdx: index('settlements_supplier_status_idx').on(t.supplierId, t.status),
  }),
);

export const settlementItems = sqliteTable(
  'settlement_items',
  {
    id: text('id').primaryKey(),
    settlementId: text('settlement_id')
      .notNull()
      .references(() => settlements.id),
    earningId: text('earning_id')
      .notNull()
      .references(() => supplierEarnings.id),
    netCents: integer('net_cents').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    settlementIdx: index('settlement_items_settlement_idx').on(t.settlementId),
    earningUq: uniqueIndex('settlement_items_earning_uq').on(t.earningId),
  }),
);

export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
export type SettlementItem = typeof settlementItems.$inferSelect;
export type NewSettlementItem = typeof settlementItems.$inferInsert;
