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
    { id: 'bt-restaurant', slug: 'restaurant', name: 'Restaurant', active: true },
  ] as any[],
  audit: [] as any[],
  inUse: false,
}));

vi.mock('../../src/modules/admin/catalog/typesRepository', () => ({
  listBusinessTypes: async (_d1: any) => state.rows,
  getBusinessType: async (_d1: any, id: string) => state.rows.find((r) => r.id === id) ?? null,
  createBusinessType: async (_d1: any, data: any) => {
    state.rows.push(data);
    return data;
  },
  updateBusinessType: async (_d1: any, id: string, patch: any) => {
    const before = state.rows.find((r) => r.id === id);
    if (!before) return null;
    const after = { ...before, ...patch };
    state.rows = state.rows.map((r) => (r.id === id ? after : r));
    return { before, after };
  },
  softDeleteBusinessType: async (_d1: any, id: string) => {
    const before = state.rows.find((r) => r.id === id);
    if (!before) return null;
    state.rows = state.rows.map((r) => (r.id === id ? { ...r, active: false } : r));
    return { ...before, active: false };
  },
  businessesUsingType: async (_d1: any, _id: string) => state.inUse,
  suppliersUsingType: async (_d1: any, _id: string) => false,
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import typesRouter from '../../src/modules/admin/catalog/typesRoutes';
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
  app.route('/api/admin/types', typesRouter);
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
  state.rows = [{ id: 'bt-restaurant', slug: 'restaurant', name: 'Restaurant', active: true }];
  state.audit = [];
  state.inUse = false;
}

describe('GET /api/admin/types/business', () => {
  beforeEach(reset);

  it('ops → 200', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/types/business', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/types/business', () => {
  beforeEach(reset);

  it('ops creates → 201 + audit', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/types/business', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'cafe', name: 'Café' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('business_type.create');
  });

  it('support → 403', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/types/business', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'cafe', name: 'Café' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/types/business/:id', () => {
  beforeEach(reset);

  it('rename → 200', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/types/business/bt-restaurant', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Restaurants' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('business_type.update');
  });
});

describe('DELETE /api/admin/types/business/:id', () => {
  beforeEach(reset);

  it('in use → 409', async () => {
    state.inUse = true;
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/types/business/bt-restaurant', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('TYPE_IN_USE');
  });

  it('not in use → 200 + soft-delete + audit', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/types/business/bt-restaurant', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('business_type.delete');
  });
});
