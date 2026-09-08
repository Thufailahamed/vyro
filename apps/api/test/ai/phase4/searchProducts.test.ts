import { describe, it, expect, vi } from 'vitest';
import { searchProductsHandler } from '../../../src/modules/ai/intents/searchProducts';

const baseHit = (overrides: any = {}) => ({
  product: { id: 'p1', name: 'Samba Rice 25kg', unit: 'bag', categoryId: 'c', packSize: '25kg' },
  bestOffer: {
    supplier: { id: 's1', name: 'Best Wholesale' },
    priceCents: 1_900_000,
    leadTimeDays: 2,
    availabilityStatus: 'in_stock',
    minOrderQty: 1,
  },
  offerCount: 3,
  ...overrides,
});

describe('searchProductsHandler with NL filters', () => {
  it('applies priceMaxCents + sort=price_asc and removes phrase', async () => {
    const searchProductsFiltered = vi.fn(async () => [baseHit()]);
    const repos = { searchProductsFiltered, searchProducts: vi.fn() } as any;
    const r = await searchProductsHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: {
          intent: 'search_products',
          slots: {} as any,
          confidence: 0.7,
        },
        prompt: 'cheap rice under Rs. 20,000 tomorrow',
      },
      repos,
    );
    expect(r.components[0]?.type).toBe('supplier_list_card');
    expect(searchProductsFiltered).toHaveBeenCalledWith(expect.objectContaining({
      query: 'rice',
      priceMaxCents: 2_000_000,
      availableWithinDays: 1,
      sort: 'price_asc',
    }));
  });

  it('clarifies when both query and filters are empty', async () => {
    const repos = { searchProductsFiltered: vi.fn(), searchProducts: vi.fn() } as any;
    const r = await searchProductsHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: { intent: 'search_products', slots: {} as any, confidence: 0.5 },
        prompt: '   ',
      },
      repos,
    );
    expect(r.components[0]?.type).toBe('clarification_card');
  });

  it('passes supplierName filter', async () => {
    const searchProductsFiltered = vi.fn(async () => [baseHit()]);
    const repos = { searchProductsFiltered, searchProducts: vi.fn() } as any;
    await searchProductsHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: { intent: 'search_products', slots: {} as any, confidence: 0.7 },
        prompt: 'sugar from Best Wholesale',
      },
      repos,
    );
    expect(searchProductsFiltered).toHaveBeenCalledWith(expect.objectContaining({
      query: 'sugar',
      supplierName: 'Best Wholesale',
    }));
  });
});
