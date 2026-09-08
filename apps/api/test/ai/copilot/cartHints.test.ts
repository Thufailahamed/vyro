import { describe, expect, it, vi } from 'vitest';
import { buildCartHints } from '../../../src/modules/ai/cartHints';

describe('buildCartHints', () => {
  const repos = (offerMap: Record<string, Array<{ priceCents: number; leadTimeDays: number; availabilityStatus: string; supplier: { id: string; name: string } }>>) =>
    ({
      listOffersByProduct: vi.fn(async (productId: string) => offerMap[productId] ?? []),
    }) as any;

  it('returns empty for empty cart', async () => {
    expect(await buildCartHints(repos({}), [], 0)).toEqual([]);
  });

  it('suggests switch-to-save when alternative is cheaper', async () => {
    const hints = await buildCartHints(
      repos({
        p1: [
          { priceCents: 500000, leadTimeDays: 3, availabilityStatus: 'in_stock', supplier: { id: 's1', name: 'A' } },
          { priceCents: 420000, leadTimeDays: 3, availabilityStatus: 'in_stock', supplier: { id: 's2', name: 'B' } },
        ],
      }),
      [{ productId: 'p1', productName: 'Rice', quantity: 2, priceCents: 500000, supplierName: 'A' }],
      0,
    );
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.length).toBeLessThanOrEqual(3);
    expect(hints[0]!.kind).toBe('switch_save');
    expect(hints[0]!.savingCents).toBe(160000);
  });

  it('caps at 3 hints', async () => {
    const lines = Array.from({ length: 5 }, (_, i) => ({
      productId: `p${i}`,
      productName: `Product ${i}`,
      quantity: 1,
      priceCents: 500000,
      supplierName: 'A',
    }));
    const offerMap: Record<string, any> = {};
    for (let i = 0; i < 5; i++) {
      offerMap[`p${i}`] = [
        { priceCents: 500000, leadTimeDays: 1, availabilityStatus: 'in_stock', supplier: { id: 's1', name: 'A' } },
        { priceCents: 400000, leadTimeDays: 1, availabilityStatus: 'in_stock', supplier: { id: 's2', name: 'B' } },
      ];
    }
    const hints = await buildCartHints(repos(offerMap), lines, 0);
    expect(hints.length).toBeLessThanOrEqual(3);
  });

  it('skips when alternative is not cheaper', async () => {
    const hints = await buildCartHints(
      repos({
        p1: [
          { priceCents: 500000, leadTimeDays: 3, availabilityStatus: 'in_stock', supplier: { id: 's1', name: 'A' } },
          { priceCents: 600000, leadTimeDays: 3, availabilityStatus: 'in_stock', supplier: { id: 's2', name: 'B' } },
        ],
      }),
      [{ productId: 'p1', productName: 'Rice', quantity: 1, priceCents: 500000, supplierName: 'A' }],
      0,
    );
    expect(hints.filter((h) => h.kind === 'switch_save')).toHaveLength(0);
  });
});
