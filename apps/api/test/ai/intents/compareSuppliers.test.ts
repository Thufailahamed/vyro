import { describe, expect, it } from 'vitest';
import { compareSuppliersHandler } from '../../../src/modules/ai/intents/compareSuppliers';
import { supplierRecommendHandler } from '../../../src/modules/ai/intents/supplierRecommend';
import { mockRepos } from '../helpers/aiFixture';

const repos = mockRepos({
  products: [{ id: 'p1', name: 'Samba Rice', categoryId: 'c1', unit: 'kg' }],
  offers: [
    { id: 'o1', supplierId: 's1', productId: 'p1', priceCents: 420000, minOrderQty: 1, leadTimeDays: 1, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's1', name: 'Alpha' } },
    { id: 'o2', supplierId: 's2', productId: 'p1', priceCents: 450000, minOrderQty: 1, leadTimeDays: 1, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's2', name: 'Beta' } },
    { id: 'o3', supplierId: 's3', productId: 'p1', priceCents: 410000, minOrderQty: 1, leadTimeDays: 5, deliveryAvailable: false, availabilityStatus: 'low', active: true, supplier: { id: 's3', name: 'Gamma' } },
  ],
  pos: [
    { id: 'po1', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 100000, createdAt: Date.now() - 5 * 86400000 },
    { id: 'po2', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 200000, createdAt: Date.now() - 10 * 86400000 },
    { id: 'po3', businessId: 'b1', supplierId: 's2', status: 'cancelled', totalCents: 50000, createdAt: Date.now() - 5 * 86400000 },
  ],
});

describe('compareSuppliersHandler', () => {
  it('ranks suppliers by price ascending', async () => {
    const r = await compareSuppliersHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'compare_suppliers', slots: { productName: 'samba rice', topN: 3 }, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('supplier_list_card');
    const list = (r.components[0].data as any).suppliers as Array<{ supplierName: string; priceCents: number; rank: number }>;
    expect(list[0].supplierName).toBe('Gamma');
    expect(list[0].priceCents).toBe(410000);
    expect(list[0].rank).toBe(1);
    expect(list.length).toBe(3);
  });

  it('honors topN', async () => {
    const r = await compareSuppliersHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'compare_suppliers', slots: { productName: 'samba rice', topN: 1 }, confidence: 0.9 } },
      repos,
    );
    expect((r.components[0].data as any).suppliers.length).toBe(1);
  });
});

describe('supplierRecommendHandler', () => {
  it('returns ranked list with composite score and badges', async () => {
    const r = await supplierRecommendHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'supplier_recommend', slots: { productName: 'samba rice', optimizeFor: 'reliability' }, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('supplier_list_card');
    const list = (r.components[0].data as any).suppliers as Array<{ supplierName: string; rank: number; fillRate: number; badge?: string }>;
    expect(list.length).toBe(3);
    // Alpha has 100% fill rate (2/2 delivered) → BEST OVERALL or tied; must include a badge somewhere
    expect(list.some((s) => s.badge === 'BEST OVERALL' || s.badge === 'CHEAPEST' || s.badge === 'FASTEST')).toBe(true);
  });

  it('optimizes for price when optimizeFor=price', async () => {
    const r = await supplierRecommendHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'supplier_recommend', slots: { productName: 'samba rice', optimizeFor: 'price' }, confidence: 0.9 } },
      repos,
    );
    const list = (r.components[0].data as any).suppliers as Array<{ supplierName: string; rank: number }>;
    expect(list[0].supplierName).toBe('Gamma'); // cheapest
  });
});
