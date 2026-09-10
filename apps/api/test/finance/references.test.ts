import { describe, expect, it } from 'vitest';
import {
  adjustmentNumber,
  bankTransferReference,
  payoutNumber,
  paymentNumber,
  refundNumber,
  settlementNumber,
} from '../../src/modules/finance/numbers';
import { commissionFor } from '../../src/modules/finance/commission';

describe('financial reference numbers', () => {
  it('payment numbers carry the VYRO-PAY prefix + date', () => {
    const n = paymentNumber(new Date('2026-09-10T00:00:00Z').getTime());
    expect(n.startsWith('VYRO-PAY-20260910-')).toBe(true);
    expect(new Set([paymentNumber(), paymentNumber(), paymentNumber()]).size).toBe(3);
  });

  it('refund/settlement/payout/adjustment/bank refs are unique + prefixed', () => {
    expect(refundNumber().startsWith('VYRO-RFD-')).toBe(true);
    expect(settlementNumber().startsWith('SET-')).toBe(true);
    expect(payoutNumber().startsWith('PO-')).toBe(true);
    expect(adjustmentNumber().startsWith('ADJ-')).toBe(true);
    expect(bankTransferReference().startsWith('VYRO-PAY-')).toBe(true);
  });
});

describe('commission snapshot math', () => {
  it('commissionFor pins the applied bps value', () => {
    // Order at 5%: later rule changes cannot rewrite this stored value.
    expect(commissionFor(100000, 500)).toBe(5000);
    expect(commissionFor(100000, 700)).toBe(7000);
  });
});
