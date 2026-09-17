import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  po: null as any,
  poItems: [] as any[],
  offers: [] as any[],
  cart: null as any,
  upsertCalls: [] as Array<{ cartId: string; supplierProductId: string; quantity: number }>,
}));

vi.mock('../../src/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

vi.mock('../../src/modules/cart/repository', () => ({
  ensureOpenCart: vi.fn(async (_d1, businessId) => state.cart ?? { id: 'cart-1', businessId, status: 'open', createdAt: 0, updatedAt: 0 }),
  upsertCartItem: vi.fn(async (_d1, cartId, supplierProductId, quantity) => {
    state.upsertCalls.push({ cartId, supplierProductId, quantity });
    return 'ci-' + state.upsertCalls.length;
  }),
}));

vi.mock('@vyro/db/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vyro/db/schema')>()),
  purchaseOrders: { name: 'purchase_orders' },
  purchaseOrderItems: { name: 'purchase_order_items' },
  supplierProducts: { name: 'supplier_products' },
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: any) => ({
        where: (_cond: any) => ({
          get: async () => {
            if (table?.name === 'purchase_orders') return state.po;
            return null;
          },
          all: async () => {
            if (table?.name === 'purchase_order_items') return state.poItems;
            if (table?.name === 'supplier_products') return state.offers;
            return [];
          },
        }),
      }),
    }),
  }),
}));

// Pass through the real @vyro/shared exports so the service exercises the
// real `checkPurchasable` (and friends). If the shared function's contract
// drifts, this test should catch it.
vi.mock('@vyro/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vyro/shared')>();
  return {
    ...actual,
  };
});

import { reorderFromOrder } from '../../src/modules/cart/reorder';

const D1_STUB: D1Database = {} as D1Database;

describe('cart/reorder (happy path)', () => {
  beforeEach(() => {
    state.po = null;
    state.poItems = [];
    state.offers = [];
    state.cart = { id: 'cart-1', businessId: 'biz-1', status: 'open', createdAt: 0, updatedAt: 0 };
    state.upsertCalls = [];
  });

  it('adds all 3 lines of a completed single-supplier PO with drift and tier math', async () => {
    // PO is completed and owned by the caller.
    state.po = {
      id: 'po-1',
      businessId: 'biz-1',
      status: 'completed',
    };
    // One supplier product; tier1 active at qty>=10 with 10% discount.
    state.offers = [{
      id: 'sp-1',
      supplierId: 'sup-1',
      priceCents: 1100, // +10% vs snapshot
      minOrderQty: 1,
      tier1MinQty: 10,
      tier1DiscountPct: 10,
      tier2MinQty: 50,
      tier2DiscountPct: 0,
      tier3MinQty: 100,
      tier3DiscountPct: 0,
      availabilityStatus: 'in_stock',
      stockQty: 1000,
      reservedQty: 0,
      lowStockThreshold: 0,
      trackInventory: false,
      deletedAt: null,
    }];
    // Three lines all referencing the same supplier product; one of them
    // (qty=12) crosses tier1, the others (qty=5) stay at list price.
    state.poItems = [
      { id: 'poi-a', purchaseOrderId: 'po-1', supplierProductId: 'sp-1', unitPriceCentsSnapshot: 1000, quantity: 5 },
      { id: 'poi-b', purchaseOrderId: 'po-1', supplierProductId: 'sp-1', unitPriceCentsSnapshot: 1000, quantity: 12 },
      { id: 'poi-c', purchaseOrderId: 'po-1', supplierProductId: 'sp-1', unitPriceCentsSnapshot: 1000, quantity: 3 },
    ];

    const result = await reorderFromOrder(D1_STUB, 'po-1', 'biz-1');

    expect(result.cartId).toBe('cart-1');
    expect(result.addedCount).toBe(3);
    expect(result.skippedCount).toBe(0);
    expect(result.added).toHaveLength(3);

    // Drift: ((1100-1000)/1000)*100 = 10.0
    expect(result.added.every((d) => d.driftPct === 10)).toBe(true);

    // Tier math:
    //   qty=5  → tier1MinQty=10 not met → no tier, line total = 1100 * 5 = 5500, effectiveUnitCents=1100
    //   qty=12 → tier1 hit (minQty=10, discountPct=10) → line total = round(1100*12*0.9) = 11880, effectiveUnitCents=round(11880/12)=990
    //   qty=3  → no tier → line total = 1100 * 3 = 3300, effectiveUnitCents=1100
    const byQty = [...result.added].sort((a, b) => a.qty - b.qty);
    expect(byQty[0]).toMatchObject({ qty: 3, newUnitCents: 1100, newEffectiveUnitCents: 1100, tierApplied: null });
    expect(byQty[1]).toMatchObject({ qty: 5, newUnitCents: 1100, newEffectiveUnitCents: 1100, tierApplied: null });
    expect(byQty[2]).toMatchObject({ qty: 12, newUnitCents: 1100, newEffectiveUnitCents: 990, tierApplied: { minQty: 10, discountPct: 10 } });

    // Subtotal: 5500 + 11880 + 3300 = 20680
    expect(result.addedSubtotalCents).toBe(20680);

    // All three lines upserted into the cart at their original qty.
    expect(state.upsertCalls).toEqual([
      { cartId: 'cart-1', supplierProductId: 'sp-1', quantity: 5 },
      { cartId: 'cart-1', supplierProductId: 'sp-1', quantity: 12 },
      { cartId: 'cart-1', supplierProductId: 'sp-1', quantity: 3 },
    ]);
  });
});

describe('cart/reorder (skip reasons)', () => {
  beforeEach(() => {
    state.po = null;
    state.poItems = [];
    state.offers = [];
    state.cart = { id: 'cart-1', businessId: 'biz-1', status: 'open', createdAt: 0, updatedAt: 0 };
    state.upsertCalls = [];
  });

  it('skips archived supplier products (deletedAt != null)', async () => {
    state.po = { id: 'po-1', businessId: 'biz-1', status: 'completed' };
    // Soft-deleted offer — service must short-circuit before purchasability.
    state.offers = [{
      id: 'sp-1',
      supplierId: 'sup-1',
      priceCents: 1100,
      minOrderQty: 1,
      tier1MinQty: 10,
      tier1DiscountPct: 0,
      tier2MinQty: 0,
      tier2DiscountPct: 0,
      tier3MinQty: 0,
      tier3DiscountPct: 0,
      availabilityStatus: 'in_stock',
      stockQty: 1000,
      reservedQty: 0,
      lowStockThreshold: 0,
      trackInventory: false,
      deletedAt: 1234567890,
    }];
    state.poItems = [
      { id: 'poi-a', purchaseOrderId: 'po-1', supplierProductId: 'sp-1', unitPriceCentsSnapshot: 1000, quantity: 5 },
    ];

    const result = await reorderFromOrder(D1_STUB, 'po-1', 'biz-1');

    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.added).toHaveLength(0);
    expect(result.skipped).toEqual([
      { supplierProductId: 'sp-1', supplierId: 'sup-1', qty: 5, reason: 'archived' },
    ]);
    expect(state.upsertCalls).toEqual([]);
  });

  it('skips out-of-stock offers', async () => {
    state.po = { id: 'po-1', businessId: 'biz-1', status: 'completed' };
    // trackInventory=true, free=stockQty-reservedQty-lowStockThreshold=0, requested=5 → INSUFFICIENT_STOCK.
    state.offers = [{
      id: 'sp-1',
      supplierId: 'sup-1',
      priceCents: 1100,
      minOrderQty: 1,
      tier1MinQty: 10,
      tier1DiscountPct: 0,
      tier2MinQty: 0,
      tier2DiscountPct: 0,
      tier3MinQty: 0,
      tier3DiscountPct: 0,
      availabilityStatus: 'low',
      stockQty: 5,
      reservedQty: 5,
      lowStockThreshold: 0,
      trackInventory: true,
      deletedAt: null,
    }];
    state.poItems = [
      { id: 'poi-a', purchaseOrderId: 'po-1', supplierProductId: 'sp-1', unitPriceCentsSnapshot: 1000, quantity: 5 },
    ];

    const result = await reorderFromOrder(D1_STUB, 'po-1', 'biz-1');

    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.skipped[0]).toMatchObject({
      supplierProductId: 'sp-1',
      qty: 5,
      reason: 'out_of_stock',
    });
    expect(state.upsertCalls).toEqual([]);
  });

  it('skips offers where reordered qty < tier1MinQty (MOQ check)', async () => {
    state.po = { id: 'po-1', businessId: 'biz-1', status: 'completed' };
    // minOrderQty=10 — qty=3 trips BELOW_MOQ.
    state.offers = [{
      id: 'sp-1',
      supplierId: 'sup-1',
      priceCents: 1100,
      minOrderQty: 10,
      tier1MinQty: 0,
      tier1DiscountPct: 0,
      tier2MinQty: 0,
      tier2DiscountPct: 0,
      tier3MinQty: 0,
      tier3DiscountPct: 0,
      availabilityStatus: 'in_stock',
      stockQty: 1000,
      reservedQty: 0,
      lowStockThreshold: 0,
      trackInventory: false,
      deletedAt: null,
    }];
    state.poItems = [
      { id: 'poi-a', purchaseOrderId: 'po-1', supplierProductId: 'sp-1', unitPriceCentsSnapshot: 1000, quantity: 3 },
    ];

    const result = await reorderFromOrder(D1_STUB, 'po-1', 'biz-1');

    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.skipped[0]).toMatchObject({
      supplierProductId: 'sp-1',
      qty: 3,
      reason: 'below_moq',
    });
    expect(state.upsertCalls).toEqual([]);
  });

  it('groups by supplierId: adds all supplier-A lines, skips supplier-B lines (multi_supplier_unsupported)', async () => {
    // The service locks to the first supplier encountered after sorting items
    // by id, then adds ALL of that supplier's lines (multiple SKUs OK). Items
    // from any other supplier are skipped with 'multi_supplier_unsupported'.
    // Per spec narrative: "first supplier's lines added; rest skipped".
    state.po = { id: 'po-1', businessId: 'biz-1', status: 'completed' };
    // Five offers — three supplier-A SKUs and two supplier-B SKUs.
    state.offers = [
      {
        id: 'sp-a1',
        supplierId: 'sup-A',
        priceCents: 1100,
        minOrderQty: 1,
        tier1MinQty: 0,
        tier1DiscountPct: 0,
        tier2MinQty: 0,
        tier2DiscountPct: 0,
        tier3MinQty: 0,
        tier3DiscountPct: 0,
        availabilityStatus: 'in_stock',
        stockQty: 1000,
        reservedQty: 0,
        lowStockThreshold: 0,
        trackInventory: false,
        deletedAt: null,
      },
      {
        id: 'sp-a2',
        supplierId: 'sup-A',
        priceCents: 2000,
        minOrderQty: 1,
        tier1MinQty: 0,
        tier1DiscountPct: 0,
        tier2MinQty: 0,
        tier2DiscountPct: 0,
        tier3MinQty: 0,
        tier3DiscountPct: 0,
        availabilityStatus: 'in_stock',
        stockQty: 1000,
        reservedQty: 0,
        lowStockThreshold: 0,
        trackInventory: false,
        deletedAt: null,
      },
      {
        id: 'sp-a3',
        supplierId: 'sup-A',
        priceCents: 3000,
        minOrderQty: 1,
        tier1MinQty: 0,
        tier1DiscountPct: 0,
        tier2MinQty: 0,
        tier2DiscountPct: 0,
        tier3MinQty: 0,
        tier3DiscountPct: 0,
        availabilityStatus: 'in_stock',
        stockQty: 1000,
        reservedQty: 0,
        lowStockThreshold: 0,
        trackInventory: false,
        deletedAt: null,
      },
      {
        id: 'sp-b1',
        supplierId: 'sup-B',
        priceCents: 5000,
        minOrderQty: 1,
        tier1MinQty: 0,
        tier1DiscountPct: 0,
        tier2MinQty: 0,
        tier2DiscountPct: 0,
        tier3MinQty: 0,
        tier3DiscountPct: 0,
        availabilityStatus: 'in_stock',
        stockQty: 1000,
        reservedQty: 0,
        lowStockThreshold: 0,
        trackInventory: false,
        deletedAt: null,
      },
      {
        id: 'sp-b2',
        supplierId: 'sup-B',
        priceCents: 6000,
        minOrderQty: 1,
        tier1MinQty: 0,
        tier1DiscountPct: 0,
        tier2MinQty: 0,
        tier2DiscountPct: 0,
        tier3MinQty: 0,
        tier3DiscountPct: 0,
        availabilityStatus: 'in_stock',
        stockQty: 1000,
        reservedQty: 0,
        lowStockThreshold: 0,
        trackInventory: false,
        deletedAt: null,
      },
    ];
    state.poItems = [
      // Three supplier-A lines, ordered so poi-a wins the lock.
      { id: 'poi-a', purchaseOrderId: 'po-1', supplierProductId: 'sp-a1', unitPriceCentsSnapshot: 1000, quantity: 5 },
      { id: 'poi-b', purchaseOrderId: 'po-1', supplierProductId: 'sp-a2', unitPriceCentsSnapshot: 2000, quantity: 3 },
      { id: 'poi-c', purchaseOrderId: 'po-1', supplierProductId: 'sp-a3', unitPriceCentsSnapshot: 3000, quantity: 2 },
      // Two supplier-B lines — both must be skipped.
      { id: 'poi-d', purchaseOrderId: 'po-1', supplierProductId: 'sp-b1', unitPriceCentsSnapshot: 5000, quantity: 4 },
      { id: 'poi-e', purchaseOrderId: 'po-1', supplierProductId: 'sp-b2', unitPriceCentsSnapshot: 6000, quantity: 6 },
    ];

    const result = await reorderFromOrder(D1_STUB, 'po-1', 'biz-1');

    expect(result.addedCount).toBe(3);
    expect(result.skippedCount).toBe(2);
    expect(result.added).toHaveLength(3);
    expect(result.skipped).toHaveLength(2);

    // All three supplier-A lines added (in id-sort order).
    expect(result.added.map((a) => a.supplierProductId)).toEqual(['sp-a1', 'sp-a2', 'sp-a3']);
    // Skipped entries carry the actual supplier id (sup-B), not the primary.
    expect(result.skipped).toEqual([
      { supplierProductId: 'sp-b1', supplierId: 'sup-B', qty: 4, reason: 'multi_supplier_unsupported' },
      { supplierProductId: 'sp-b2', supplierId: 'sup-B', qty: 6, reason: 'multi_supplier_unsupported' },
    ]);
    // Only the three matching lines are upserted into the cart.
    expect(state.upsertCalls).toEqual([
      { cartId: 'cart-1', supplierProductId: 'sp-a1', quantity: 5 },
      { cartId: 'cart-1', supplierProductId: 'sp-a2', quantity: 3 },
      { cartId: 'cart-1', supplierProductId: 'sp-a3', quantity: 2 },
    ]);
  });
});

describe('cart/reorder (drift math)', () => {
  beforeEach(() => {
    state.po = null;
    state.poItems = [];
    state.offers = [];
    state.cart = { id: 'cart-1', businessId: 'biz-1', status: 'open', createdAt: 0, updatedAt: 0 };
    state.upsertCalls = [];
  });

  it('round-trips oldUnitCents=100, newUnitCents=125 to driftPct=+25', async () => {
    state.po = { id: 'po-1', businessId: 'biz-1', status: 'completed' };
    state.offers = [{
      id: 'sp-1',
      supplierId: 'sup-1',
      priceCents: 125,
      minOrderQty: 1,
      tier1MinQty: 0,
      tier1DiscountPct: 0,
      tier2MinQty: 0,
      tier2DiscountPct: 0,
      tier3MinQty: 0,
      tier3DiscountPct: 0,
      availabilityStatus: 'in_stock',
      stockQty: 1000,
      reservedQty: 0,
      lowStockThreshold: 0,
      trackInventory: false,
      deletedAt: null,
    }];
    state.poItems = [
      { id: 'poi-a', purchaseOrderId: 'po-1', supplierProductId: 'sp-1', unitPriceCentsSnapshot: 100, quantity: 1 },
    ];

    const result = await reorderFromOrder(D1_STUB, 'po-1', 'biz-1');

    expect(result.addedCount).toBe(1);
    expect(result.added[0]).toMatchObject({
      oldUnitCents: 100,
      newUnitCents: 125,
      driftPct: 25,
    });
  });

  it('returns 0 drift when oldUnitCents=0 (no division-by-zero)', async () => {
    state.po = { id: 'po-1', businessId: 'biz-1', status: 'completed' };
    state.offers = [{
      id: 'sp-1',
      supplierId: 'sup-1',
      priceCents: 500,
      minOrderQty: 1,
      tier1MinQty: 0,
      tier1DiscountPct: 0,
      tier2MinQty: 0,
      tier2DiscountPct: 0,
      tier3MinQty: 0,
      tier3DiscountPct: 0,
      availabilityStatus: 'in_stock',
      stockQty: 1000,
      reservedQty: 0,
      lowStockThreshold: 0,
      trackInventory: false,
      deletedAt: null,
    }];
    // unitPriceCentsSnapshot=0 — exercises the driftPct guard against /0.
    state.poItems = [
      { id: 'poi-a', purchaseOrderId: 'po-1', supplierProductId: 'sp-1', unitPriceCentsSnapshot: 0, quantity: 1 },
    ];

    const result = await reorderFromOrder(D1_STUB, 'po-1', 'biz-1');

    expect(result.addedCount).toBe(1);
    expect(result.added[0]).toMatchObject({
      oldUnitCents: 0,
      newUnitCents: 500,
      driftPct: 0,
    });
  });
});

describe('cart/reorder (PO eligibility)', () => {
  beforeEach(() => {
    state.po = null;
    state.poItems = [];
    state.offers = [];
    state.cart = { id: 'cart-1', businessId: 'biz-1', status: 'open', createdAt: 0, updatedAt: 0 };
    state.upsertCalls = [];
  });

  it('throws PO_NOT_REORDERABLE when po.status is pending', async () => {
    state.po = { id: 'po-pending', businessId: 'biz-1', status: 'pending' };
    state.poItems = []; // would otherwise be irrelevant — gate fires before item walk.

    await expect(
      reorderFromOrder(D1_STUB, 'po-pending', 'biz-1'),
    ).rejects.toMatchObject({ status: 409, code: 'PO_NOT_REORDERABLE' });

    expect(state.upsertCalls).toEqual([]);
  });
});