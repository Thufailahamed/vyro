import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
import { users } from './users';

/**
 * Bank transfers (spec §10-11). A business transfer is PENDING_VERIFICATION
 * until a privileged admin verifies it — uploading a receipt never marks it
 * paid. Supports expected vs verified amounts and reconciliation outcomes.
 */
export const bankTransfers = sqliteTable(
  'bank_transfers',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    referenceNumber: text('reference_number').notNull().unique(),
    expectedCents: integer('expected_cents').notNull(),
    transferredCents: integer('transferred_cents'),
    verifiedCents: integer('verified_cents'),
    differenceCents: integer('difference_cents').notNull().default(0),
    currency: text('currency').notNull().default('LKR'),
    status: text('status', {
      enum: ['pending', 'proof_submitted', 'pending_verification', 'verified', 'rejected', 'correction_requested', 'matched', 'partial', 'exception'],
    })
      .notNull()
      .default('pending'),
    proofR2Key: text('proof_r2_key'),
    proofFileName: text('proof_file_name'),
    proofMimeType: text('proof_mime_type'),
    proofUploadedAt: integer('proof_uploaded_at'),
    bankReference: text('bank_reference'),
    verifiedByUserId: text('verified_by_user_id').references(() => users.id),
    verifiedAt: integer('verified_at'),
    rejectionReason: text('rejection_reason'),
    submittedByUserId: text('submitted_by_user_id').references(() => users.id),
    submittedAt: integer('submitted_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    paymentIdx: index('bank_transfers_payment_idx').on(t.paymentId),
    statusIdx: index('bank_transfers_status_idx').on(t.status),
    refIdx: index('bank_transfers_ref_idx').on(t.referenceNumber),
  }),
);

export type BankTransfer = typeof bankTransfers.$inferSelect;
export type NewBankTransfer = typeof bankTransfers.$inferInsert;
