import { z } from 'zod';

const cents = z.number().int().nonnegative();
const positiveCents = z.number().int().positive();
const currency = z.string().length(3).default('LKR');
const isoDate = z.number().int().positive();

// --- Bank transfer (spec §10-11) ---

export const bankTransferSubmitSchema = z
  .object({
    transferredCents: positiveCents,
    bankReference: z.string().max(200).optional(),
  })
  .strict();

export const bankTransferVerifySchema = z
  .object({
    verifiedCents: positiveCents,
    bankReference: z.string().min(1).max(200),
  })
  .strict();

export const bankTransferRejectSchema = z
  .object({ reason: z.string().min(1).max(500) })
  .strict();

export const bankTransferCorrectionSchema = z
  .object({ message: z.string().min(1).max(500) })
  .strict();

// --- COD (spec §9) ---

export const codCollectSchema = z
  .object({
    collectedCents: cents,
    collectorName: z.string().max(200).optional(),
    collectionMethod: z.string().max(100).optional(),
    collectionReference: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const codReconcileSchema = z
  .object({
    status: z.enum(['matched', 'under_collected', 'over_collected', 'missing', 'disputed', 'reconciled']),
    notes: z.string().max(500).optional(),
  })
  .strict();

// --- Refunds (spec §17-20) ---

export const refundRequestSchema = z
  .object({
    amountCents: positiveCents.optional(),
    reason: z.string().min(1).max(500),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict();

export const refundDecisionSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

// --- Commission rules (spec §15) ---

export const commissionRuleSchema = z
  .object({
    scope: z.enum(['global', 'category', 'supplier', 'product', 'promotional']),
    scopeId: z.string().min(1).max(100).optional(),
    bps: z.number().int().min(0).max(10000),
    name: z.string().max(200).optional(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
  })
  .strict()
  .refine((d) => d.scope === 'global' || !!d.scopeId, {
    message: 'scopeId required for non-global rules',
  });

// --- Settlements & payouts (spec §21-22) ---

export const settlementCreateSchema = z
  .object({
    supplierId: z.string().min(1),
    earningIds: z.array(z.string().min(1)).min(1).max(500).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict();

export const payoutCreateSchema = z
  .object({
    settlementId: z.string().min(1),
    method: z.enum(['bank', 'cash']),
    bankAccountId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict();

export const payoutDecisionSchema = z
  .object({
    externalReference: z.string().max(200).optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

// --- Supplier bank accounts (spec §23) ---

export const supplierBankAccountSchema = z
  .object({
    bankName: z.string().min(1).max(200),
    accountHolder: z.string().min(1).max(200),
    accountNumber: z.string().min(6).max(32),
    branch: z.string().max(200).optional(),
    accountType: z.string().max(100).optional(),
  })
  .strict();

// --- Adjustments (spec §58) ---

export const adjustmentCreateSchema = z
  .object({
    kind: z.enum(['credit', 'debit']),
    accountType: z.enum(['supplier', 'business', 'platform']),
    accountId: z.string().min(1),
    amountCents: positiveCents,
    currency,
    entityType: z.string().max(100).optional(),
    entityId: z.string().max(100).optional(),
    reason: z.string().min(1).max(500),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict();

// --- Reconciliation (spec §57) ---

export const reconciliationResolveSchema = z
  .object({ note: z.string().min(1).max(500) })
  .strict();

// --- Reports / filtering (spec §42-44) ---

export const financialQuerySchema = z
  .object({
    from: z.coerce.number().int().positive().optional(),
    to: z.coerce.number().int().positive().optional(),
    status: z.string().max(50).optional(),
    method: z.string().max(50).optional(),
    supplierId: z.string().optional(),
    businessId: z.string().optional(),
    orderId: z.string().optional(),
    type: z.string().max(50).optional(),
    currency: z.string().length(3).optional(),
    cursor: z.coerce.number().int().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export type BankTransferSubmitInput = z.infer<typeof bankTransferSubmitSchema>;
export type BankTransferVerifyInput = z.infer<typeof bankTransferVerifySchema>;
export type CodCollectInput = z.infer<typeof codCollectSchema>;
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;
export type CommissionRuleInput = z.infer<typeof commissionRuleSchema>;
export type SettlementCreateInput = z.infer<typeof settlementCreateSchema>;
export type PayoutCreateInput = z.infer<typeof payoutCreateSchema>;
export type SupplierBankAccountInput = z.infer<typeof supplierBankAccountSchema>;
export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>;
