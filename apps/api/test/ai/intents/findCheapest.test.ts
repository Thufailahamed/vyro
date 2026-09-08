import { describe, expect, it } from 'vitest';
import { findCheapestHandler } from '../../../src/modules/ai/intents/findCheapest';
import { searchProductsHandler } from '../../../src/modules/ai/intents/searchProducts';
import { mockRepos } from '../helpers/aiFixture';

const repos = mockRepos({
  products: [{ id: 'p1', name: 'Samba Rice', categoryId: 'c1', unit: 'kg', packSize: '25kg' }],
  offers: [
    { id: 'o1', supplierId: 's1', productId: 'p1', priceCents: 450000, minOrderQty: 1, leadTimeDays: 1, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's1', name: 'Alpha' } },
    { id: 'o2', supplierId: 's2', productId: 'p1', priceCents: 430000, minOrderQty: 1, leadTimeDays: 3, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's2', name: 'Beta' } },
  ],
});

describe('findCheapestHandler', () => {
  it('returns recommendation_card with cheapest supplier', async () => {
    const r = await findCheapestHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: { intent: 'find_cheapest', slots: { productName: 'samba rice', quantity: 25, unit: 'kg' }, confidence: 0.9 },
      },
      repos,
    );
    expect(r.components[0].type).toBe('recommendation_card');
    const data = r.components[0].data as any;
    expect(data.supplierName).toBe('Beta');
    expect(data.priceCents).toBe(430000);
    expect(r.actions.length).toBeGreaterThan(0);
  });

  it('returns clarification_card when product not found', async () => {
    const r = await findCheapestHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: { intent: 'find_cheapest', slots: { productName: 'unicorn tears' }, confidence: 0.5 },
      },
      repos,
    );
    expect(r.components[0].type).toBe('clarification_card');
  });

  it('returns clarification_card when productName missing', async () => {
    const r = await findCheapestHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: { intent: 'find_cheapest', slots: {}, confidence: 0.5 },
      },
      repos,
    );
    expect(r.components[0].type).toBe('clarification_card');
  });
});

describe('searchProductsHandler', () => {
  it('returns supplier_list_card with matching hits', async () => {
    const r = await searchProductsHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: { intent: 'search_products', slots: { query: 'rice' }, confidence: 0.9 },
      },
      repos,
    );
    expect(r.components[0].type).toBe('supplier_list_card');
    const data = r.components[0].data as any;
    expect(data.hits.length).toBe(1);
    expect(data.hits[0].bestSupplierName).toBe('Beta');
    expect(data.hits[0].bestPriceCents).toBe(430000);
  });

  it('returns clarification_card when query empty', async () => {
    const r = await searchProductsHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: { intent: 'search_products', slots: {}, confidence: 0.5 },
      },
      repos,
    );
    expect(r.components[0].type).toBe('clarification_card');
  });
});
