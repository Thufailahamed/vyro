import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const payoutBatches = sqliteTable(
  'payout_batches',
  {
    id: text('id').primaryKey(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    approvedBy: text('approved_by').references(() => users.id),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    totalCents: integer('total_cents').notNull().default(0),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
    approvedAt: integer('approved_at'),
  },
  (t) => ({
    statusIdx: index('payout_batches_status_idx').on(t.status),
  }),
);

export type PayoutBatch = typeof payoutBatches.$inferSelect;
export type NewPayoutBatch = typeof payoutBatches.$inferInsert;
