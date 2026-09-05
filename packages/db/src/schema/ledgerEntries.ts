import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: text('id').primaryKey(),
    accountType: text('account_type', { enum: ['supplier', 'business', 'platform'] }).notNull(),
    accountId: text('account_id').notNull(),
    direction: text('direction', { enum: ['debit', 'credit'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    refType: text('ref_type', { enum: ['payment', 'refund', 'payout', 'fee', 'adjustment'] }).notNull(),
    refId: text('ref_id').notNull(),
    description: text('description').notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    accountIdx: index('ledger_account_idx').on(t.accountType, t.accountId, t.createdAt),
    refIdx: index('ledger_ref_idx').on(t.refType, t.refId),
  }),
);

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
