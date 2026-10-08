import { describe, expect, it } from 'vitest';
import { remainingRefundableCents } from '../src/lib/refundable';

describe('remainingRefundableCents', () => {
  it('returns the full amount with no prior refunds', () => {
    expect(remainingRefundableCents(10000, [])).toBe(10000);
  });

  it('subtracts completed and in-flight refunds', () => {
    expect(
      remainingRefundableCents(10000, [
        { amountCents: 2000, status: 'completed' },
        { amountCents: 1500, status: 'processing' },
        { amountCents: 500, status: 'requested' },
        { amountCents: 300, status: 'approved' },
      ]),
    ).toBe(5700);
  });

  it('ignores failed, rejected and cancelled refunds', () => {
    expect(
      remainingRefundableCents(10000, [
        { amountCents: 4000, status: 'failed' },
        { amountCents: 3000, status: 'rejected' },
        { amountCents: 2000, status: 'cancelled' },
      ]),
    ).toBe(10000);
  });

  it('never goes negative', () => {
    expect(remainingRefundableCents(1000, [{ amountCents: 5000, status: 'completed' }])).toBe(0);
  });
});
