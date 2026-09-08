import { describe, it, expect } from 'vitest';
import { simulateSupplierSwitch } from './simulator';

describe('simulateSupplierSwitch', () => {
  it('computes positive savings when alternative is cheaper', () => {
    const r = simulateSupplierSwitch({
      productName: 'Rice',
      currentSupplier: 'A',
      currentPriceCents: 500000,
      currentLeadDays: 3,
      alternativeSupplier: 'B',
      alternativePriceCents: 420000,
      alternativeLeadDays: 4,
      monthlyQuantity: 4,
      cadenceSampleSize: 8,
    });
    expect(r.monthlyDeltaCents).toBe(-320000);
    expect(r.annualDeltaCents).toBe(-3840000);
    expect(r.leadDeltaDays).toBe(1);
    expect(r.confidence).toBe('high');
    expect(r.savingsPct).toBeCloseTo(16, 0);
  });

  it('marks confidence low when cadence sample is thin', () => {
    const r = simulateSupplierSwitch({
      productName: 'Oil',
      currentSupplier: 'A',
      currentPriceCents: 300000,
      currentLeadDays: 2,
      alternativeSupplier: 'C',
      alternativePriceCents: 290000,
      alternativeLeadDays: 2,
      monthlyQuantity: 1,
      cadenceSampleSize: 1,
    });
    expect(r.confidence).toBe('low');
  });

  it('returns zero delta when prices equal', () => {
    const r = simulateSupplierSwitch({
      productName: 'X',
      currentSupplier: 'A',
      currentPriceCents: 100000,
      currentLeadDays: 1,
      alternativeSupplier: 'B',
      alternativePriceCents: 100000,
      alternativeLeadDays: 1,
      monthlyQuantity: 5,
      cadenceSampleSize: 10,
    });
    expect(r.monthlyDeltaCents).toBe(0);
    expect(r.savingsPct).toBe(0);
  });
});
