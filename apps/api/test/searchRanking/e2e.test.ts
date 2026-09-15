import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u1' });
    await next();
  },
}));

describe('searchRanking e2e', () => {
  it('score is deterministic for same input', async () => {
    const { computeRanking } = await import('../../src/modules/searchRanking/score');
    const input = [{ priceCents: 100, leadTimeDays: 2, supplier: { verificationStatus: 'verified', reviewCount: 5, reviewAvgX100: 460, lastReviewAt: null } }];
    const a = computeRanking(input);
    const b = computeRanking(input);
    expect(a[0].score).toBe(b[0].score);
    expect(a[0].rank).toBe(b[0].rank);
  });

  it('reorders 3 offers by composite score', async () => {
    const { computeRanking } = await import('../../src/modules/searchRanking/score');
    const out = computeRanking([
      { priceCents: 100000, leadTimeDays: 7, supplier: { verificationStatus: 'pending', reviewCount: 0, reviewAvgX100: 0, lastReviewAt: null } },
      { priceCents: 80000, leadTimeDays: 1, supplier: { verificationStatus: 'verified', reviewCount: 20, reviewAvgX100: 480, lastReviewAt: Date.now() } },
      { priceCents: 90000, leadTimeDays: 3, supplier: { verificationStatus: 'verified', reviewCount: 5, reviewAvgX100: 400, lastReviewAt: null } },
    ]);
    expect(out[0].rank).toBe(1);
    expect(out[1].rank).toBe(2);
    expect(out[2].rank).toBe(3);
  });
});
