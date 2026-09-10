import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Reconciliation exceptions (spec §57). The engine flags anything where a
 * rupee cannot be explained; admins resolve with an action + note. History
 * is preserved — resolved rows stay for audit.
 */
export const reconciliationExceptions = sqliteTable(
  'reconciliation_exceptions',
  {
    id: text('id').primaryKey(),
    kind: text('kind', {
      enum: [
        'payment_without_order',
        'order_without_payment',
        'duplicate_payment',
        'amount_mismatch',
        'unmatched_bank_transfer',
        'cod_discrepancy',
        'earnings_mismatch',
        'settlement_mismatch',
        'payout_mismatch',
        'refund_mismatch',
      ],
    }).notNull(),
    severity: text('severity', { enum: ['info', 'warning', 'critical'] })
      .notNull()
      .default('warning'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    expectedCents: integer('expected_cents'),
    actualCents: integer('actual_cents'),
    differenceCents: integer('difference_cents').notNull().default(0),
    currency: text('currency').notNull().default('LKR'),
    detail: text('detail'),
    status: text('status', { enum: ['open', 'acknowledged', 'resolved', 'dismissed'] })
      .notNull()
      .default('open'),
    resolvedByUserId: text('resolved_by_user_id').references(() => users.id),
    resolvedAt: integer('resolved_at'),
    resolutionNote: text('resolution_note'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    statusIdx: index('reconciliation_exceptions_status_idx').on(t.status),
    kindIdx: index('reconciliation_exceptions_kind_idx').on(t.kind),
  }),
);

export type ReconciliationException = typeof reconciliationExceptions.$inferSelect;
export type NewReconciliationException = typeof reconciliationExceptions.$inferInsert;
