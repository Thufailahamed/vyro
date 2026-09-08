import { describe, expect, it } from 'vitest';
import { savingsHandler } from '../../../src/modules/ai/intents/savings';
import { usualOrderHandler } from '../../../src/modules/ai/intents/usualOrder';
import { reorderHandler } from '../../../src/modules/ai/intents/reorder';
import { priceChangesHandler } from '../../../src/modules/ai/intents/priceChanges';
import { deliveryEstimateHandler } from '../../../src/modules/ai/intents/deliveryEstimate';
import { mockRepos } from '../helpers/aiFixture';

const DAY = 86400000;
const now = Date.now();

const repos = mockRepos({
  products: [
    { id: 'p1', name: 'Samba Rice', categoryId: 'c1', unit: 'kg' },
    { id: 'p2', name: 'Sugar', categoryId: 'c1', unit: 'kg' },
  ],
  offers: [
    { id: 'o1', supplierId: 's1', productId: 'p1', priceCents: 500000, minOrderQty: 1, leadTimeDays: 2, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's1', name: 'Alpha' } },
    { id: 'o2', supplierId: 's2', productId: 'p1', priceCents: 450000, minOrderQty: 1, leadTimeDays: 1, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's2', name: 'Beta' } },
    { id: 'o3', supplierId: 's1', productId: 'p2', priceCents: 300000, minOrderQty: 1, leadTimeDays: 3, deliveryAvailable: false, availabilityStatus: 'in_stock', active: true, supplier: { id: 's1', name: 'Alpha' } },
  ],
  pos: [
    { id: 'po1', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 500000, createdAt: now - 5 * DAY },
    { id: 'po2', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 300000, createdAt: now - 21 * DAY },
    { id: 'po3', businessId: 'b1', supplierId: 's1', status: 'delivered', totalCents: 250000, createdAt: now - 50 * DAY },
  ],
  poItems: [
    { id: 'i1', purchaseOrderId: 'po1', productId: 'p1', supplierId: 's1', quantity: 25, unitPriceCents: 600000, createdAt: now - 5 * DAY },
    { id: 'i2', purchaseOrderId: 'po2', productId: 'p1', supplierId: 's1', quantity: 25, unitPriceCents: 550000, createdAt: now - 21 * DAY },
    { id: 'i3', purchaseOrderId: 'po3', productId: 'p1', supplierId: 's1', quantity: 25, unitPriceCents: 520000, createdAt: now - 50 * DAY },
  ],
});

describe('savingsHandler', () => {
  it('estimates savings vs cheapest live offer with disclaimer', async () => {
    const r = await savingsHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'savings', slots: {}, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('savings_card');
    const data = r.components[0].data as any;
    expect(data.opportunities.length).toBeGreaterThan(0);
    expect(data.disclaimer).toMatch(/estimated/i);
  });
});

describe('usualOrderHandler', () => {
  it('returns procurement_plan_card with averaged lines', async () => {
    const r = await usualOrderHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'usual_order', slots: { weeksBack: 8 }, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('procurement_plan_card');
    const lines = (r.components[0].data as any).lines;
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('reorderHandler', () => {
  it('suggests items last bought 14+ days ago', async () => {
    const r = await reorderHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'reorder', slots: {}, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('procurement_plan_card');
  });
});

describe('priceChangesHandler', () => {
  it('emits spend_summary_card with movers', async () => {
    const r = await priceChangesHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'price_changes', slots: { period: 'month' }, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('spend_summary_card');
    expect((r.components[0].data as any).movers.length).toBeGreaterThan(0);
  });
});

describe('deliveryEstimateHandler', () => {
  it('clarifies when no product or supplier', async () => {
    const r = await deliveryEstimateHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'delivery_estimate', slots: {}, confidence: 0.5 } },
      repos,
    );
    expect(r.components[0].type).toBe('clarification_card');
  });

  it('returns supplier_list_card sorted by lead time', async () => {
    const r = await deliveryEstimateHandler(
      { env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'delivery_estimate', slots: { productName: 'samba rice' }, confidence: 0.9 } },
      repos,
    );
    expect(r.components[0].type).toBe('supplier_list_card');
    const suppliers = (r.components[0].data as any).suppliers;
    expect(suppliers[0].supplierName).toBe('Beta'); // leadTime 1
  });
});
