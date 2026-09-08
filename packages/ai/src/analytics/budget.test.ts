import { describe, expect, it } from 'vitest';
import { fitBudget } from './budget';

describe('fitBudget', () => {
  const lines = [
    { productName: 'Rice', supplier: 'A', priceCents: 500000, quantity: 2, cheapestPriceCents: 400000, cheapestSupplier: 'B' },
    { productName: 'Oil', supplier: 'A', priceCents: 300000, quantity: 1, cheapestPriceCents: 280000, cheapestSupplier: 'C' },
  ];

  it('swaps biggest saving first to fit cap', () => {
    const r = fitBudget(lines, 1100000);
    expect(r.withinBudget).toBe(true);
    expect(r.swaps[0]!.productName).toBe('Rice');
    expect(r.total).toBeLessThanOrEqual(1100000);
  });

  it('reports impossibility without dropping lines', () => {
    const r = fitBudget(lines, 1000);
    expect(r.withinBudget).toBe(false);
    expect(r.lines).toHaveLength(2);
    expect(r.cheapestTotal).toBe(1080000);
  });

  it('returns lines unchanged when already within cap', () => {
    const r = fitBudget(lines, 5000000);
    expect(r.withinBudget).toBe(true);
    expect(r.swaps).toHaveLength(0);
    expect(r.total).toBe(500000 * 2 + 300000);
    expect(r.lines.every((l) => !l.swapped)).toBe(true);
  });

  it('reports zero savings when alternative is not cheaper', () => {
    const r = fitBudget(
      [{ productName: 'X', supplier: 'A', priceCents: 100000, quantity: 1, cheapestPriceCents: 100000, cheapestSupplier: 'A' }],
      100000,
    );
    expect(r.withinBudget).toBe(true);
    expect(r.swaps).toHaveLength(0);
  });
});
