import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const chargebacks = sqliteTable(
  'chargebacks',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id').notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: ['open', 'resolved', 'cancelled'] })
      .notNull()
      .default('open'),
    resolvedBy: text('resolved_by').references(() => users.id),
    resolvedAt: integer('resolved_at'),
    refundId: text('refund_id'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    statusIdx: index('chargebacks_status_idx').on(t.status),
  }),
);

export type Chargeback = typeof chargebacks.$inferSelect;
export type NewChargeback = typeof chargebacks.$inferInsert;
