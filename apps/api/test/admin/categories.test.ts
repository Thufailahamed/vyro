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
  rows: [
    { id: 'c-1', slug: 'beverages', name: 'Beverages', parentId: null, active: true, sortOrder: 1 },
    { id: 'c-2', slug: 'tea', name: 'Tea', parentId: 'c-1', active: true, sortOrder: 1 },
  ] as any[],
  audit: [] as any[],
  hasChildren: true,
  descendant: false,
  created: null as any,
}));

vi.mock('../../src/modules/admin/catalog/categoriesRepository', () => ({
  listCategoriesTree: async (_d1: any) => state.rows,
  getCategory: async (_d1: any, id: string) => state.rows.find((r) => r.id === id) ?? null,
  createCategory: async (_d1: any, data: any) => {
    state.created = data;
    state.rows.push({ ...data });
    return data;
  },
  updateCategory: async (_d1: any, id: string, patch: any) => {
    const before = state.rows.find((r) => r.id === id);
    if (!before) return null;
    const after = { ...before, ...patch };
    state.rows = state.rows.map((r) => (r.id === id ? after : r));
    return { before, after };
  },
  softDeleteCategory: async (_d1: any, id: string) => {
    const before = state.rows.find((r) => r.id === id);
    if (!before) return null;
    state.rows = state.rows.map((r) => (r.id === id ? { ...r, active: false } : r));
    return { ...before, active: false };
  },
  hasActiveChildren: async (_d1: any, _id: string) => state.hasChildren,
  isDescendantOf: async (_d1: any, _candidate: string, _ancestor: string) => state.descendant,
  productsInCategory: async () => 0,
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import categoriesRouter from '../../src/modules/admin/catalog/categoriesRoutes';
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
  app.route('/api/admin/categories', categoriesRouter);
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
  state.rows = [
    { id: 'c-1', slug: 'beverages', name: 'Beverages', parentId: null, active: true, sortOrder: 1 },
    { id: 'c-2', slug: 'tea', name: 'Tea', parentId: 'c-1', active: true, sortOrder: 1 },
  ];
  state.audit = [];
  state.hasChildren = true;
  state.descendant = false;
  state.created = null;
}

describe('GET /api/admin/categories', () => {
  beforeEach(reset);

  it('ops → 200 + tree', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/categories', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.length).toBe(2);
  });
});

describe('POST /api/admin/categories', () => {
  beforeEach(reset);

  it('ops creates → 201 + audit', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'spices', name: 'Spices' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('category.create');
  });

  it('support → 403 (no category:write)', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'spices', name: 'Spices' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/categories/:id', () => {
  beforeEach(reset);

  it('reparent into descendant → 400 CATEGORY_CYCLE', async () => {
    state.descendant = true;
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/categories/c-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentId: 'c-2' }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CATEGORY_CYCLE');
  });

  it('rename → 200 + audit', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/categories/c-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Drinks' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('category.update');
  });
});

describe('DELETE /api/admin/categories/:id', () => {
  beforeEach(reset);

  it('has active children → 409', async () => {
    state.hasChildren = true;
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/categories/c-1', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CATEGORY_HAS_CHILDREN');
  });

  it('no children → 200 + soft-delete + audit', async () => {
    state.hasChildren = false;
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/categories/c-2', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('category.delete');
  });
});
