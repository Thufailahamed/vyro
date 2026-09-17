import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  po: null as any,
  poItems: [] as any[],
  offer: null as any,
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
            if (table?.name === 'supplier_products') return state.offer ? [state.offer] : [];
            return [];
          },
        }),
      }),
    }),
  }),
}));

// Mirror @vyro/shared's real checkPurchasable so the test exercises real
// decision logic against the mocked supplier product shape.
vi.mock('@vyro/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vyro/shared')>();
  return {
    ...actual,
    checkPurchasable: (offer: any, quantity: number) => {
      if (offer.availabilityStatus === 'out_of_stock') {
        return { ok: false, code: 'OUT_OF_STOCK', message: 'oos' };
      }
      const moq = offer.minOrderQty ?? 1;
      if (quantity < moq) {
        return { ok: false, code: 'BELOW_MOQ', message: 'moq', minOrderQty: moq };
      }
      if (offer.trackInventory) {
        const free = (offer.stockQty ?? 0) - (offer.reservedQty ?? 0);
        if (quantity > free) {
          return { ok: false, code: 'INSUFFICIENT_STOCK', message: 'ins', available: free };
        }
      }
      return { ok: true };
    },
  };
});

import { reorderFromOrder } from '../../src/modules/cart/reorder';

const D1_STUB: D1Database = {} as D1Database;

describe('cart/reorder (happy path)', () => {
  beforeEach(() => {
    state.po = null;
    state.poItems = [];
    state.offer = null;
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
    state.offer = {
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
    };
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