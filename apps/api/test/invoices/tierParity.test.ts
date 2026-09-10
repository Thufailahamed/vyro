import { describe, expect, it } from 'vitest';
import { applyTier, resolveTier, type TierSet } from '../../src/modules/cart/pricing';

describe('invoice tier parity', () => {
  it('invoice uses stored line totals, not qty x unit price', () => {
    const tiers: TierSet = {
      tier1MinQty: 10,
      tier1DiscountPct: 5,
      tier2MinQty: 50,
      tier2DiscountPct: 10,
      tier3MinQty: 100,
      tier3DiscountPct: 15,
    };
    const lineTotal = applyTier(1000, 60, resolveTier(tiers, 60));
    expect(lineTotal).toBe(54000);
    expect(lineTotal).not.toBe(1000 * 60);
  });
});
