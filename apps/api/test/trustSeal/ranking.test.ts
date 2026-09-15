import { describe, it, expect } from 'vitest';
import { computeRanking } from '../../src/modules/searchRanking/score';

describe('trustseal ranking boost', () => {
  const base = {
    priceCents: 100000,
    leadTimeDays: 5,
    supplier: { verificationStatus: 'verified', reviewCount: 5, reviewAvgX100: 400, lastReviewAt: null, trustSealed: false },
  };
  it('trustSealed outranks identical free verified', () => {
    const ranked = computeRanking([
      { ...base },
      { ...base, supplier: { ...base.supplier, trustSealed: true } },
    ]);
    expect(ranked[0]!.index).toBe(1);
    expect(ranked[0]!.reasons).toContain('TrustSEAL');
  });
});
