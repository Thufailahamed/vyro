import { describe, expect, it } from 'vitest';
import { computeRanking, type RankingInput } from '../../src/modules/searchRanking/score';

describe('computeRanking', () => {
  const baseOffer: RankingInput = {
    priceCents: 100000,
    leadTimeDays: 3,
    supplier: {
      verificationStatus: 'verified',
      reviewCount: 10,
      reviewAvgX100: 450,
      lastReviewAt: Date.now() - 5 * 24 * 3600 * 1000,
    },
  };

  it('returns score between 0 and 100', () => {
    const r = computeRanking([baseOffer]);
    expect(r[0].score).toBeGreaterThan(0);
    expect(r[0].score).toBeLessThanOrEqual(100);
  });

  it('returns rank 1 for top offer', () => {
    const r = computeRanking([baseOffer]);
    expect(r[0].rank).toBe(1);
  });

  it('ranks cheaper offer above expensive one', () => {
    const a = computeRanking([{ ...baseOffer, priceCents: 100000 }, { ...baseOffer, priceCents: 120000 }]);
    expect(a[0].rank).toBe(1);
    expect(a[1].rank).toBe(2);
  });

  it('tie-breaks on price ascending', () => {
    const r = computeRanking([
      { ...baseOffer, priceCents: 100000, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } },
      { ...baseOffer, priceCents: 80000, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } },
    ]);
    expect(r[0].rank).toBe(1);
    expect(r[1].rank).toBe(2);
  });

  it('penalizes slower lead time', () => {
    const fast = computeRanking([{ ...baseOffer, leadTimeDays: 1, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } }]);
    const slow = computeRanking([{ ...baseOffer, leadTimeDays: 14, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } }]);
    expect(fast[0].score).toBeGreaterThan(slow[0].score);
  });

  it('boosts verified suppliers', () => {
    const verified = computeRanking([{ ...baseOffer, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0, verificationStatus: 'verified' } }]);
    const pending = computeRanking([{ ...baseOffer, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0, verificationStatus: 'pending' } }]);
    expect(verified[0].score).toBeGreaterThan(pending[0].score);
  });

  it('handles zero reviews with neutral rating score', () => {
    const r = computeRanking([{ ...baseOffer, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } }]);
    expect(r[0].score).toBeGreaterThan(0);
  });

  it('handles null lastReviewAt with neutral freshness', () => {
    const r = computeRanking([{ ...baseOffer, supplier: { ...baseOffer.supplier, lastReviewAt: null } }]);
    expect(r[0].score).toBeGreaterThan(0);
  });

  it('produces reasons array', () => {
    const r = computeRanking([baseOffer]);
    expect(Array.isArray(r[0].reasons)).toBe(true);
  });

  it('reason includes Verified for verified supplier', () => {
    const r = computeRanking([baseOffer]);
    expect(r[0].reasons.join(' ')).toMatch(/Verified/);
  });

  it('caps reasons at 2 entries', () => {
    const r = computeRanking([baseOffer]);
    expect(r[0].reasons.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for empty input', () => {
    expect(computeRanking([])).toEqual([]);
  });
});
