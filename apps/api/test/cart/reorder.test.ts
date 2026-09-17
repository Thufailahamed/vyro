import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  po: null as any,
  poItems: [] as any[],
  offers: new Map<string, any>(),
  cart: null as any,
  cartItems: [] as any[],
  createUpsert: [] as any[],
}));

vi.mock('../../src/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (cond: any) => ({
          get: async () => {
            // First call reads PO; subsequent calls read supplier_products by id.
            if (cond?.predicate?.type === 'po') return state.po;
            return null;
          },
          all: async () => {
            // Listing read — used for offers batch and PO items batch.
            return [];
          },
        }),
      }),
    }),
    insert: () => ({ values: () => ({ run: async () => ({ success: true, meta: { changes: 1 } }) }) }),
    run: async () => ({ success: true, meta: { changes: 0 } }),
  }),
}));

describe('cart/reorder (happy path)', () => {
  beforeEach(() => {
    state.po = null;
    state.poItems = [];
    state.offers.clear();
    state.cart = null;
    state.cartItems = [];
  });

  it('imported service throws "function is not defined" prior to implementation', async () => {
    // Replace with real assertions once the service exists.
    expect(true).toBe(false); // placeholder replaced by Task 2 onward
  });
});
