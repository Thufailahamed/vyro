import { describe, it, expect, vi } from 'vitest';
import { resolveProduct } from '../../../src/modules/ai/intents/productMatch';

const hit = (name: string) => ({
  id: name.replace(/\s+/g, '-'),
  name,
  unit: 'kg',
  categoryId: 'c',
  packSize: null,
  bestOffer: null,
  offerCount: 1,
});

describe('resolveProduct with token-Jaccard re-rank', () => {
  it('exact wins', async () => {
    const repos = {
      searchProducts: vi.fn(async () => [hit('Samba Rice 25kg')]),
      findProductByName: vi.fn(),
    } as any;
    const r = await resolveProduct(repos, 'Samba Rice 25kg');
    expect(r.kind).toBe('single');
  });

  it('fuzzy Jaccard >= 0.4 picks the best fuzzy when single candidate', async () => {
    const repos = {
      searchProducts: vi.fn(async () => [hit('Samba Rice 5kg')]),
      findProductByName: vi.fn(),
    } as any;
    const r = await resolveProduct(repos, 'Samba Rice 25kg');
    expect(r.kind).toBe('single');
  });

  it('multiple candidates below threshold → clarification', async () => {
    const repos = {
      searchProducts: vi.fn(async () => [hit('Sugar 1kg'), hit('Flour 1kg')]),
      findProductByName: vi.fn(),
    } as any;
    const r = await resolveProduct(repos, 'Basmati Rice 25kg');
    expect(r.kind).toBe('clarify');
  });

  it('high-confidence single match (>=0.6 Jaccard + 0.2 lead) beats runner-up', async () => {
    const repos = {
      searchProducts: vi.fn(async () => [
        hit('Samba Rice 25kg Premium'),
        hit('Sugar 1kg'),
      ]),
      findProductByName: vi.fn(),
    } as any;
    const r = await resolveProduct(repos, 'Samba Rice');
    expect(r.kind).toBe('single');
    if (r.kind === 'single') expect(r.product.name).toContain('Samba');
  });
});
