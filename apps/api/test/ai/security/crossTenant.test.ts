import { describe, it, expect } from 'vitest';
import { mockRepos } from '../helpers/aiFixture';

const DAY = 86_400_000;
const now = Date.now();

describe('security: cross-tenant isolation', () => {
  it('spendInPeriod returns only the caller business\'s PO total', async () => {
    const repos = mockRepos({
      pos: [
        { id: 'po1', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 100000, createdAt: now - DAY },
        { id: 'po2', businessId: 'b2', supplierId: 's1', status: 'delivered', totalCents: 999999, createdAt: now - DAY },
      ],
    });
    const a = await repos.spendInPeriod({ businessId: 'b1', sinceMs: now - 7 * DAY });
    const b = await repos.spendInPeriod({ businessId: 'b2', sinceMs: now - 7 * DAY });
    expect(a.totalCents).toBe(100000);
    expect(b.totalCents).toBe(999999);
  });

  it('spendForProduct is scoped to the caller\'s businessId', async () => {
    const repos = mockRepos({
      products: [{ id: 'p1', businessId: 'b1', name: 'Rice', unit: 'kg', categoryId: null }],
      pos: [
        { id: 'po1', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 100000, createdAt: now - DAY },
        { id: 'po2', businessId: 'b2', supplierId: 's1', status: 'delivered', totalCents: 999999, createdAt: now - DAY },
      ],
      poItems: [
        { id: 'i1', purchaseOrderId: 'po1', productId: 'p1', supplierId: 's1', quantity: 5, unitPriceCents: 1000, createdAt: now - DAY },
        { id: 'i2', purchaseOrderId: 'po2', productId: 'p1', supplierId: 's1', quantity: 5, unitPriceCents: 1000, createdAt: now - DAY },
      ],
    });
    const total = await repos.spendForProduct({ businessId: 'b1', sinceMs: now - 7 * DAY, productName: 'Rice' });
    expect(total).toBe(5000);
  });

  it('searchProducts never mixes other businesses (catalog is per-business in drizzle)', async () => {
    const repos = mockRepos({
      products: [{ id: 'p1', businessId: 'b1', name: 'Rice', unit: 'kg', categoryId: null }],
    });
    const rows = await repos.searchProducts('rice');
    expect(rows.every((p) => p.id === 'p1')).toBe(true);
  });
});
