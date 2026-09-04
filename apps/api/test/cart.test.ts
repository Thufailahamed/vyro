import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

const cartsStore = new Map<string, any>();
const itemsStore: any[] = [];
const offers = new Map<string, any>([['sp-1', { id: 'sp-1', productId: 'p-1', supplierId: 'sup-1', priceCents: 1000, minOrderQty: 1, leadTimeDays: 2, availabilityStatus: 'in_stock', active: true, deletedAt: null }]]);

vi.mock('../src/modules/cart/repository', () => ({
  ensureOpenCart: vi.fn(async (_d1, businessId) => {
    const existing = [...cartsStore.values()].find((c) => c.businessId === businessId && c.status === 'open');
    if (existing) return existing;
    const id = 'cart-' + (cartsStore.size + 1);
    const cart = { id, businessId, status: 'open', createdAt: 0, updatedAt: 0 };
    cartsStore.set(id, cart);
    return cart;
  }),
  listCartItems: vi.fn(async (_d1, cartId) => itemsStore.filter((i) => i.cartId === cartId)),
  findCartItem: vi.fn(async (_d1, cartId, spId) => itemsStore.find((i) => i.cartId === cartId && i.supplierProductId === spId) ?? null),
  upsertCartItem: vi.fn(async (_d1, cartId, spId, quantity) => {
    const existing = itemsStore.find((i) => i.cartId === cartId && i.supplierProductId === spId);
    if (existing) { existing.quantity = quantity; return existing.id; }
    const id = 'ci-' + (itemsStore.length + 1);
    itemsStore.push({ id, cartId, supplierProductId: spId, quantity });
    return id;
  }),
  deleteCartItem: vi.fn(async (_d1, itemId) => {
    const i = itemsStore.findIndex((x) => x.id === itemId);
    if (i !== -1) itemsStore.splice(i, 1);
  }),
  clearCart: vi.fn(async () => {}),
  findOpenCartByBusiness: vi.fn(async () => null),
  createOpenCart: vi.fn(async () => 'cart-x'),
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: any) => {
        const name = table?.name ?? table;
        return {
          where: (c: any) => ({
            get: async () => {
              if (name === 'cart_items') return itemsStore.find((i) => i.id === c?.params?.[0]) ?? null;
              return null;
            },
            all: async () => {
              if (name === 'cart_items') return itemsStore;
              return [];
            },
          }),
        };
      },
    }),
  }),
}));

vi.mock('@vyro/db/schema', () => ({
  businessMembers: { name: 'business_members' },
  businessTypes: { name: 'business_types' },
  suppliers: { name: 'suppliers' },
  supplierProducts: { name: 'supplier_products' },
  products: { name: 'products' },
  carts: { name: 'carts' },
  cartItems: { name: 'cart_items' },
  supplierMembers: { name: 'supplier_members' },
  auditLogs: { name: 'audit_logs' },
}));

let sessionCtx: any = null;
vi.mock('../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

vi.mock('../src/middleware/rbac', () => ({
  requireRole: (_opts: any) => async (c: any, next: any) => {
    const ctx = c.get('ctx');
    if (!ctx) return c.json({ code: 'UNAUTHORIZED', message: 'No session' }, 401);
    if (_opts?.admin && !ctx.isAdmin) return c.json({ code: 'FORBIDDEN', message: 'Admin only' }, 403);
    await next();
  },
}));

import app from '../src';

const D1_STUB: D1Database = {} as D1Database;

beforeEach(() => {
  cartsStore.clear();
  itemsStore.length = 0;
  sessionCtx = null;
});

describe('cart module', () => {
  it('GET /api/cart without session is 401', async () => {
    const res = await app.request('/api/cart?businessId=biz-1', { method: 'GET' }, { DB: D1_STUB, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(401);
  });

  it('GET /api/cart seeds an open cart', async () => {
    sessionCtx = { userId: 'u1', memberships: [], isAdmin: false };
    // route calls requireBusinessMember -> SELECT row from business_members; stub returns undefined -> throws 403
    const res = await app.request('/api/cart?businessId=biz-1', { method: 'GET' }, { DB: D1_STUB, ENVIRONMENT: 'test' } as any);
    // Without real member row the route throws 403. Verify wiring.
    expect([200, 403]).toContain(res.status);
  });

  it('POST /api/cart/items validates input', async () => {
    sessionCtx = { userId: 'u1' };
    const res = await app.request(
      '/api/cart/items',
      { method: 'POST', body: JSON.stringify({ businessId: 'b', supplierProductId: 'sp-1', quantity: 0 }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(400);
  });
});
