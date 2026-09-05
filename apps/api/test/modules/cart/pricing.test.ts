import { describe, it, expect } from 'vitest';
import { resolveTier, applyTier, discountCents, nextTier, type TierSet } from '../../../src/modules/cart/pricing';

const tiers: TierSet = {
  tier1MinQty: 10, tier1DiscountPct: 5,
  tier2MinQty: 50, tier2DiscountPct: 10,
  tier3MinQty: 100, tier3DiscountPct: 15,
};

describe('resolveTier', () => {
  it('returns null when below all tiers', () => {
    expect(resolveTier(tiers, 9)).toBeNull();
  });
  it('returns tier1 at 10', () => {
    expect(resolveTier(tiers, 10)).toEqual({ minQty: 10, discountPct: 5 });
  });
  it('returns tier2 at 50', () => {
    expect(resolveTier(tiers, 50)).toEqual({ minQty: 50, discountPct: 10 });
  });
  it('returns tier2 between 50 and 99', () => {
    expect(resolveTier(tiers, 75)).toEqual({ minQty: 50, discountPct: 10 });
  });
  it('returns tier3 at 150', () => {
    expect(resolveTier(tiers, 150)).toEqual({ minQty: 100, discountPct: 15 });
  });
  it('treats 0 pct as no discount', () => {
    expect(resolveTier({ ...tiers, tier1DiscountPct: 0 }, 10)).toBeNull();
  });
});

describe('nextTier', () => {
  it('returns tier1 from qty=1', () => {
    expect(nextTier(tiers, 1)).toEqual({ minQty: 10, discountPct: 5 });
  });
  it('returns tier2 from qty=11', () => {
    expect(nextTier(tiers, 11)).toEqual({ minQty: 50, discountPct: 10 });
  });
  it('returns null when at top tier', () => {
    expect(nextTier(tiers, 100)).toBeNull();
  });
});

describe('applyTier', () => {
  it('no tier: line total = unit * qty', () => {
    expect(applyTier(1000, 5, null)).toBe(5000);
  });
  it('tier1 5% on 10 units: 9500', () => {
    expect(applyTier(1000, 10, { minQty: 10, discountPct: 5 })).toBe(9500);
  });
  it('rounds half-up', () => {
    expect(applyTier(333, 3, { minQty: 1, discountPct: 10 })).toBe(899);
  });
});

describe('discountCents', () => {
  it('zero when no tier', () => {
    expect(discountCents(1000, 5, null)).toBe(0);
  });
  it('500 for tier1 5% on 10 units @1000', () => {
    expect(discountCents(1000, 10, { minQty: 10, discountPct: 5 })).toBe(500);
  });
});
