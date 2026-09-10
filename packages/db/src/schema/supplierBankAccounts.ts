import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';
import { users } from './users';

/**
 * Supplier payout bank accounts (spec §23). Full numbers are masked in reads;
 * every create/update/verify is an audit event.
 */
export const supplierBankAccounts = sqliteTable(
  'supplier_bank_accounts',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    bankName: text('bank_name').notNull(),
    accountHolder: text('account_holder').notNull(),
    accountNumberLast4: text('account_number_last4').notNull(),
    accountNumberHash: text('account_number_hash').notNull(),
    branch: text('branch'),
    accountType: text('account_type'),
    verificationStatus: text('verification_status', {
      enum: ['pending', 'verified', 'rejected'],
    })
      .notNull()
      .default('pending'),
    verifiedByUserId: text('verified_by_user_id').references(() => users.id),
    verifiedAt: integer('verified_at'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    supplierIdx: index('supplier_bank_accounts_supplier_idx').on(t.supplierId),
  }),
);

export type SupplierBankAccount = typeof supplierBankAccounts.$inferSelect;
export type NewSupplierBankAccount = typeof supplierBankAccounts.$inferInsert;
