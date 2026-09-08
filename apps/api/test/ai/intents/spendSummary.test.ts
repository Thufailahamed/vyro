import { describe, expect, it } from 'vitest';
import { spendSummaryHandler } from '../../../src/modules/ai/intents/spendSummary';
import { productSpendHandler } from '../../../src/modules/ai/intents/productSpend';
import { supplierSpendHandler } from '../../../src/modules/ai/intents/supplierSpend';
import { mockRepos } from '../helpers/aiFixture';

const DAY = 86400000;
const now = Date.now();

const repos = mockRepos({
  products: [{ id: 'p1', name: 'Samba Rice', categoryId: 'c1', unit: 'kg' }],
  offers: [
    { id: 'o1', supplierId: 's1', productId: 'p1', priceCents: 450000, minOrderQty: 1, leadTimeDays: 1, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's1', name: 'Alpha' } },
  ],
  pos: [
    { id: 'po1', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 100000, createdAt: now - 5 * DAY },
    { id: 'po2', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 200000, createdAt: now - 40 * DAY },
    { id: 'po3', businessId: 'b1', supplierId: 's1', status: 'cancelled', totalCents: 999999, createdAt: now - 5 * DAY },
  ],
  poItems: [
    { id: 'i1', purchaseOrderId: 'po1', productId: 'p1', supplierId: 's1', quantity: 25, unitPriceCents: 4000, createdAt: now - 5 * DAY },
  ],
});

describe('spendSummaryHandler', () => {
  it('aggregates non-cancelled POs within period and excludes cancelled', async () => {
    const r = await spendSummaryHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'spend_summary', slots: { period: 'month' }, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('spend_summary_card');
    expect((r.components[0].data as any).totalCents).toBe(100000);
  });

  it('clarifies when period missing', async () => {
    const r = await spendSummaryHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'spend_summary', slots: {}, confidence: 0.5 } },
      repos,
    );
    expect(r.components[0].type).toBe('clarification_card');
  });
});

describe('productSpendHandler', () => {
  it('returns product-scoped spend within period', async () => {
    const r = await productSpendHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'product_spend', slots: { productName: 'samba rice', period: 'month' }, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('spend_summary_card');
    expect((r.components[0].data as any).scope).toBe('product');
    expect((r.components[0].data as any).totalCents).toBe(25 * 4000);
  });

  it('clarifies when product missing', async () => {
    const r = await productSpendHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'product_spend', slots: {}, confidence: 0.5 } },
      repos,
    );
    expect(r.components[0].type).toBe('clarification_card');
  });
});

describe('supplierSpendHandler', () => {
  it('returns supplier-scoped spend within period', async () => {
    const r = await supplierSpendHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'supplier_spend', slots: { supplierName: 'alpha', period: 'month' }, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('spend_summary_card');
    expect((r.components[0].data as any).scope).toBe('supplier');
    expect((r.components[0].data as any).totalCents).toBeGreaterThan(0);
  });
});
