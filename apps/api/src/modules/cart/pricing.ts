export interface TierSet {
  tier1MinQty: number;
  tier1DiscountPct: number;
  tier2MinQty: number;
  tier2DiscountPct: number;
  tier3MinQty: number;
  tier3DiscountPct: number;
}

export interface ResolvedTier {
  minQty: number;
  discountPct: number;
}

export function resolveTier(t: TierSet, qty: number): ResolvedTier | null {
  if (qty >= t.tier3MinQty && t.tier3DiscountPct > 0)
    return { minQty: t.tier3MinQty, discountPct: t.tier3DiscountPct };
  if (qty >= t.tier2MinQty && t.tier2DiscountPct > 0)
    return { minQty: t.tier2MinQty, discountPct: t.tier2DiscountPct };
  if (qty >= t.tier1MinQty && t.tier1DiscountPct > 0)
    return { minQty: t.tier1MinQty, discountPct: t.tier1DiscountPct };
  return null;
}

export function nextTier(t: TierSet, qty: number): ResolvedTier | null {
  const candidates: ResolvedTier[] = [];
  if (t.tier1DiscountPct > 0 && t.tier1MinQty > qty)
    candidates.push({ minQty: t.tier1MinQty, discountPct: t.tier1DiscountPct });
  if (t.tier2DiscountPct > 0 && t.tier2MinQty > qty)
    candidates.push({ minQty: t.tier2MinQty, discountPct: t.tier2DiscountPct });
  if (t.tier3DiscountPct > 0 && t.tier3MinQty > qty)
    candidates.push({ minQty: t.tier3MinQty, discountPct: t.tier3DiscountPct });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.minQty - b.minQty);
  return candidates[0];
}

export function applyTier(unitCents: number, qty: number, tier: ResolvedTier | null): number {
  if (!tier) return unitCents * qty;
  const gross = unitCents * qty;
  return Math.round((gross * (100 - tier.discountPct)) / 100);
}

export function discountCents(unitCents: number, qty: number, tier: ResolvedTier | null): number {
  if (!tier) return 0;
  return unitCents * qty - applyTier(unitCents, qty, tier);
}
