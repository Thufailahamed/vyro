import { describe, expect, it } from 'vitest';
import {
  adjustmentCreateSchema,
  bankTransferSubmitSchema,
  bankTransferVerifySchema,
  codCollectSchema,
  codReconcileSchema,
  commissionRuleSchema,
  payoutCreateSchema,
  refundRequestSchema,
  settlementCreateSchema,
  supplierBankAccountSchema,
} from '@vyro/validation';

describe('accounts validation (server-side, zod)', () => {
  it('bank transfer submit requires positive integer cents', () => {
    expect(bankTransferSubmitSchema.safeParse({ transferredCents: 125000 }).success).toBe(true);
    expect(bankTransferSubmitSchema.safeParse({ transferredCents: 12.5 }).success).toBe(false);
    expect(bankTransferSubmitSchema.safeParse({ transferredCents: -5 }).success).toBe(false);
  });

  it('bank verify requires a bank reference', () => {
    expect(bankTransferVerifySchema.safeParse({ verifiedCents: 125000, bankReference: 'CBQ-1' }).success).toBe(true);
    expect(bankTransferVerifySchema.safeParse({ verifiedCents: 125000 }).success).toBe(false);
  });

  it('cod collect allows zero (failed collection) but not negatives', () => {
    expect(codCollectSchema.safeParse({ collectedCents: 0 }).success).toBe(true);
    expect(codCollectSchema.safeParse({ collectedCents: 125000 }).success).toBe(true);
    expect(codCollectSchema.safeParse({ collectedCents: -1 }).success).toBe(false);
  });

  it('cod reconcile only accepts known outcomes', () => {
    expect(codReconcileSchema.safeParse({ status: 'matched' }).success).toBe(true);
    expect(codReconcileSchema.safeParse({ status: 'paid' }).success).toBe(false);
  });

  it('refund request requires a reason', () => {
    expect(refundRequestSchema.safeParse({ reason: 'damaged goods' }).success).toBe(true);
    expect(refundRequestSchema.safeParse({}).success).toBe(false);
    expect(refundRequestSchema.safeParse({ amountCents: 100 }).success).toBe(false);
  });

  it('commission rule requires scopeId for non-global scopes', () => {
    expect(commissionRuleSchema.safeParse({ scope: 'global', bps: 250 }).success).toBe(true);
    expect(commissionRuleSchema.safeParse({ scope: 'supplier', bps: 300 }).success).toBe(false);
    expect(commissionRuleSchema.safeParse({ scope: 'supplier', scopeId: 's1', bps: 300 }).success).toBe(true);
    expect(commissionRuleSchema.safeParse({ scope: 'global', bps: 10001 }).success).toBe(false);
  });

  it('settlement create requires a supplier', () => {
    expect(settlementCreateSchema.safeParse({ supplierId: 's1' }).success).toBe(true);
    expect(settlementCreateSchema.safeParse({}).success).toBe(false);
  });

  it('payout create requires a settlement + method', () => {
    expect(payoutCreateSchema.safeParse({ settlementId: 'set1', method: 'bank' }).success).toBe(true);
    expect(payoutCreateSchema.safeParse({ method: 'bank' }).success).toBe(false);
  });

  it('supplier bank account requires a plausible account number', () => {
    expect(
      supplierBankAccountSchema.safeParse({ bankName: 'Commercial Bank', accountHolder: 'ABC', accountNumber: '1234567890' }).success,
    ).toBe(true);
    expect(
      supplierBankAccountSchema.safeParse({ bankName: 'X', accountHolder: 'Y', accountNumber: '123' }).success,
    ).toBe(false);
  });

  it('adjustments require kind/account/reason and positive amount', () => {
    expect(
      adjustmentCreateSchema.safeParse({ kind: 'credit', accountType: 'supplier', accountId: 's1', amountCents: 100, reason: 'correction' }).success,
    ).toBe(true);
    expect(
      adjustmentCreateSchema.safeParse({ kind: 'credit', accountType: 'supplier', accountId: 's1', amountCents: 0, reason: 'x' }).success,
    ).toBe(false);
  });
});
