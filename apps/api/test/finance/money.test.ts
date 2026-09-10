import { describe, expect, it } from 'vitest';
import {
  allocateCents,
  assertCents,
  centsToMajor,
  customerTotalCents,
  majorToCents,
  mulBps,
  proRata,
  refundableBalanceCents,
  subCents,
  sumCents,
  supplierNetCents,
} from '@vyro/shared';

describe('minor-unit money kernel (no floats)', () => {
  it('mulBps computes half-up integer commission', () => {
    expect(mulBps(100000, 500)).toBe(5000);
    expect(mulBps(10001, 250)).toBe(250);
    expect(mulBps(0, 250)).toBe(0);
  });

  it('allocateCents splits exactly with no remainder leak', () => {
    const out = allocateCents(100000, [40000, 35000, 25000]);
    expect(out).toEqual([40000, 35000, 25000]);
    expect(sumCents(out)).toBe(100000);
  });

  it('allocateCents largest-remainder sums exactly on uneven splits', () => {
    const out = allocateCents(100, [1, 1, 1]);
    expect(sumCents(out)).toBe(100);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
  });

  it('proRata fee splits stay within the whole', () => {
    // Rs.1000.00, fee Rs.50.00, refund Rs.250.00 → fee refund Rs.12.50
    expect(proRata(5000, 25000, 100000)).toBe(1250);
  });

  it('customer total pipeline is integer-exact', () => {
    expect(
      customerTotalCents({ itemSubtotalCents: 100000, deliveryCents: 5000, taxCents: 0, discountCents: 10000 }),
    ).toBe(95000);
  });

  it('supplier net pipeline: gross - commission - fees + adj - refunds', () => {
    expect(
      supplierNetCents({ grossCents: 100000, commissionCents: 5000, supplierFeeCents: 0, adjustmentCents: 0, refundCents: 20000 }),
    ).toBe(75000);
  });

  it('refundable balance enforces total_refunded <= paid', () => {
    expect(refundableBalanceCents(100000, 25000)).toBe(75000);
    expect(() => refundableBalanceCents(100000, 100001)).toThrow();
  });

  it('major<->minor conversion round-trips without float error', () => {
    expect(majorToCents('1250.50')).toBe(125050);
    expect(centsToMajor(125050)).toBe('1250.50');
    expect(majorToCents(centsToMajor(1))).toBe(1);
    expect(() => majorToCents('abc')).toThrow();
  });

  it('rejects non-integer amounts', () => {
    expect(() => assertCents(10.5)).toThrow();
    expect(() => assertCents(-1)).toThrow();
    expect(() => subCents(5, 10.5)).toThrow();
  });
});
