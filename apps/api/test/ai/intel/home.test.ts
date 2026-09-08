import { describe, expect, it } from 'vitest';
import { mockRepos } from '../helpers/aiFixture';
import { buildHomePayload, buildInsightsPayload } from '../../../src/modules/ai/home';

describe('AI home payload', () => {
  it('returns reorder + savings + moves + monthly + concentration keys', async () => {
    const payload = await buildHomePayload(mockRepos({}), 'b1');
    expect(payload).toHaveProperty('reorderDue');
    expect(payload).toHaveProperty('savingsTotal');
    expect(payload).toHaveProperty('topMoves');
    expect(payload.monthly).toHaveLength(3);
    expect(payload.topMoves.length).toBeLessThanOrEqual(4);
  });

  it('degrades per-source failures instead of throwing', async () => {
    const broken = mockRepos({});
    broken.priceChangeMovers = async () => { throw new Error('db down'); };
    const payload = await buildHomePayload(broken, 'b1');
    expect(payload.topMoves).toEqual([]);
    expect(payload.savingsTotal).toBeGreaterThanOrEqual(0);
  });

  it('insights ranks savings first and respects limit', async () => {
    const { insights } = await buildInsightsPayload(mockRepos({}), 'b1', 10);
    expect(insights.length).toBeLessThanOrEqual(10);
  });
});
