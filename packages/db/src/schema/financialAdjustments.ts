import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Financial adjustments (spec §58). Completed financial records are NEVER
 * edited destructively — corrections are new adjustment/reversal rows that
 * reference the original entity. Applies to supplier earnings and platform
 * balances with full actor/reason audit.
 */
export const financialAdjustments = sqliteTable(
  'financial_adjustments',
  {
    id: text('id').primaryKey(),
    adjustmentNumber: text('adjustment_number').notNull().unique(),
    kind: text('kind', { enum: ['credit', 'debit'] }).notNull(),
    accountType: text('account_type', { enum: ['supplier', 'business', 'platform'] }).notNull(),
    accountId: text('account_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    reason: text('reason').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'applied', 'rejected', 'cancelled'] })
      .notNull()
      .default('pending'),
    idempotencyKey: text('idempotency_key').unique(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    approvedByUserId: text('approved_by_user_id').references(() => users.id),
    approvedAt: integer('approved_at'),
    appliedAt: integer('applied_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    accountIdx: index('financial_adjustments_account_idx').on(t.accountType, t.accountId),
    statusIdx: index('financial_adjustments_status_idx').on(t.status),
  }),
);

export type FinancialAdjustment = typeof financialAdjustments.$inferSelect;
export type NewFinancialAdjustment = typeof financialAdjustments.$inferInsert;
