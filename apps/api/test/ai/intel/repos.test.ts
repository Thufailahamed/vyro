import { describe, expect, it } from 'vitest';
import { mockRepos } from '../helpers/aiFixture';

describe('intel repos', () => {
  const repos = mockRepos({});

  it('exposes priceWindows with window averages', async () => {
    const w = await repos.priceWindows({ businessId: 'b1', productId: 'p1', recentSince: 1, priorSince: 0, priorUntil: 1 });
    expect(w.recentN).toBeGreaterThanOrEqual(0);
    expect(w.priorN).toBeGreaterThanOrEqual(0);
  });

  it('exposes lastBuyPrices', async () => {
    expect(await repos.lastBuyPrices({ businessId: 'b1', productId: 'p1', limit: 20 })).toBeInstanceOf(Array);
  });

  it('exposes supplierLifecycle with tenant-scoped counts', async () => {
    const rows = await repos.supplierLifecycle({ businessId: 'b1', sinceMs: 0 });
    expect(rows[0]).toMatchObject({ supplierId: 's1', total: 10 });
  });

  it('exposes categorySpend, monthlySpend, concentration', async () => {
    expect(await repos.categorySpend({ businessId: 'b1', sinceMs: 0 })).toBeInstanceOf(Array);
    expect(await repos.monthlySpend({ businessId: 'b1', months: 3 })).toHaveLength(3);
    expect((await repos.concentration({ businessId: 'b1', sinceMs: 0 }))[0]!.share).toBeGreaterThan(0);
  });
});
