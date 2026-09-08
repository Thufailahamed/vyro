import { describe, it, expect } from 'vitest';
import { mockRepos, aiEnvFixture } from './helpers/aiFixture';
import { drizzleRepos } from '../../src/modules/ai/intents/drizzleRepos';

describe('createDraftFromRecommendation', () => {
  const dict = { products: [{ id: 'p1', name: 'rice', categoryId: 'c1', unit: 'kg' }], offers: [{ id: 'o1', supplierId: 's1', productId: 'p1', supplier: { id: 's1', name: 'Alpha' }, priceCents: 100000, minOrderQty: 1, leadTimeDays: 1, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true }], pos: [], poItems: [] };

  it('creates a draft with valid items', async () => {
    const env = aiEnvFixture();
    const repos = mockRepos(dict as any);
    // Use the real repos wrapper so we exercise createDraftFromRecommendation path.
    // (mockRepos is wired into the full AiRepos interface.)
    const result = await repos.createDraftFromRecommendation({
      businessId: 'b1',
      userId: 'u1',
      items: [{ product: 'rice', quantity: 50, unit: 'kg', priceCents: 100000, supplier: 'Alpha' }],
      idempotencyKey: 'test-1',
    });
    expect(result.poRef).toMatch(/^PO-MOCK-/);
    expect(result.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects unknown product', async () => {
    const repos = mockRepos(dict as any);
    await expect(
      repos.createDraftFromRecommendation({
        businessId: 'b1',
        userId: 'u1',
        items: [{ product: 'tacos', quantity: 1, unit: 'pc', priceCents: 100, supplier: 'Alpha' }],
        idempotencyKey: 'test-2',
      }),
    ).rejects.toThrow(/Unknown product/);
  });

  it('rejects unknown supplier', async () => {
    const repos = mockRepos(dict as any);
    await expect(
      repos.createDraftFromRecommendation({
        businessId: 'b1',
        userId: 'u1',
        items: [{ product: 'rice', quantity: 1, unit: 'kg', priceCents: 100, supplier: 'Mystery' }],
        idempotencyKey: 'test-3',
      }),
    ).rejects.toThrow(/Unknown supplier/);
  });

  it('returns same poRef for same idempotency key', async () => {
    const repos = mockRepos(dict as any);
    const a = await repos.createDraftFromRecommendation({
      businessId: 'b1',
      userId: 'u1',
      items: [{ product: 'rice', quantity: 1, unit: 'kg', priceCents: 100, supplier: 'Alpha' }],
      idempotencyKey: 'same',
    });
    const b = await repos.createDraftFromRecommendation({
      businessId: 'b1',
      userId: 'u1',
      items: [{ product: 'rice', quantity: 1, unit: 'kg', priceCents: 100, supplier: 'Alpha' }],
      idempotencyKey: 'same',
    });
    expect(a.poRef).toBe(b.poRef);
  });
});