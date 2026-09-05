import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AdminRole } from '@vyro/auth';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    const role = (c.get('testRole') ?? null) as AdminRole | null;
    c.set('ctx', {
      userId: 'admin-1',
      email: 'admin@x.example',
      isAdmin: role !== null,
      adminRole: role,
      businesses: [],
      suppliers: [],
    });
    await n();
  },
}));

const state = vi.hoisted(() => ({
  products: [
    {
      id: 'p-1',
      name: 'White Rice 5kg',
      description: null,
      categoryId: 'cat-staples',
      brand: null,
      unit: 'bag',
      packSize: '5kg',
      active: true,
      featured: false,
      moderationNotes: null,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ] as any[],
  nextList: { items: [] as any[], nextCursor: null as string | null },
  nextGet: null as any,
  audit: [] as any[],
  patchResult: null as any,
  stale: false,
}));

vi.mock('../../src/modules/admin/catalog/productsRepository', () => ({
  listProducts: async (_d1: any, _opts: any) => state.nextList,
  getProduct: async (_d1: any, id: string) => {
    if (state.nextGet !== null) return state.nextGet;
    const row = state.products.find((p) => p.id === id);
    if (!row) return null;
    return { product: row, offers: [], category: null };
  },
  updateProduct: async (_d1: any, id: string, patch: any) => {
    if (state.stale) throw new Error('not reached in stale path');
    const before = state.products.find((p) => p.id === id);
    if (!before) return null;
    const after = { ...before, ...patch, updatedAt: Date.now() };
    return state.patchResult ?? { before, after };
  },
  lastAuditForProduct: async (_d1: any, _id: string) => state.audit,
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target, before: opts.before, after: opts.after });
  },
}));

import productsRouter from '../../src/modules/admin/catalog/routes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp(adminRole: AdminRole | null) {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => {
    c.set('testRole', adminRole);
    await next();
  });
  app.route('/api/admin/products', productsRouter);
  return app;
}

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'x',
  ADMIN_ORIGIN: 'x',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'x',
  ENVIRONMENT: 'test',
} as any;

function reset() {
  state.products = [
    {
      id: 'p-1',
      name: 'White Rice 5kg',
      description: null,
      categoryId: 'cat-staples',
      brand: null,
      unit: 'bag',
      packSize: '5kg',
      active: true,
      featured: false,
      moderationNotes: null,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];
  state.nextList = { items: [...state.products], nextCursor: null };
  state.nextGet = null;
  state.audit = [];
  state.patchResult = null;
  state.stale = false;
}

describe('GET /api/admin/products', () => {
  beforeEach(reset);

  it('non-admin → 403', async () => {
    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/products', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('ops role → 200 + list', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/products?active=true', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.length).toBe(1);
  });
});

describe('GET /api/admin/products/:id', () => {
  beforeEach(reset);

  it('404 when missing', async () => {
    state.nextGet = null;
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/products/missing', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('200 with audit tail when present', async () => {
    state.audit = [{ id: 'a-1', action: 'product.update', createdAt: 1 }];
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/products/p-1', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.product.id).toBe('p-1');
    expect(body.audit.length).toBe(1);
  });
});

describe('PATCH /api/admin/products/:id', () => {
  beforeEach(reset);

  it('ops edits name → 200 + audit written', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/products/p-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Brown Rice 5kg' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('product.update');
    expect((state.audit[0].after as any).name).toBe('Brown Rice 5kg');
  });

  it('stale write → 409', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/products/p-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'X', expectedUpdatedAt: 999 }),
      }),
      env,
    );
    expect(res.status).toBe(409);
  });

  it('support role → 200 (now has product:moderate for takedown)', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/products/p-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/products/:id/feature', () => {
  beforeEach(reset);

  it('ops toggles featured → 200 + audit', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/products/p-1/feature', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ featured: true }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('product.feature');
  });
});
