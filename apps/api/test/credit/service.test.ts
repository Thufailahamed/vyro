import { describe, expect, it } from 'vitest';
import { dueAtForTerms, availableCents, evaluateEligibility } from '../../src/modules/credit/service';

describe('credit rules', () => {
  it('computes net30 due date as +30d', () => {
    expect(dueAtForTerms('net30', 1_000)).toBe(1_000 + 30 * 24 * 60 * 60 * 1000);
  });
  it('computes available as limit-used', () => {
    expect(availableCents({ limitCents: 100, usedCents: 40 })).toBe(60);
  });
  it('requires 3 paid orders when no facility exists', () => {
    expect(evaluateEligibility({ paidOrderCount: 2, overdueCount: 0, facility: null }).eligible).toBe(false);
    expect(evaluateEligibility({ paidOrderCount: 3, overdueCount: 0, facility: null }).eligible).toBe(true);
  });

  it('treats an active facility as eligible without paid-order history', () => {
    expect(
      evaluateEligibility({ paidOrderCount: 0, overdueCount: 0, facility: { status: 'active' } }).eligible,
    ).toBe(true);
  });
});
