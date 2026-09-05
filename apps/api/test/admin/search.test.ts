import { describe, expect, it, vi } from 'vitest';
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
  allResults: {
    users: [{ id: 'u-1', email: 'x@y.z', name: 'X', role: 'user' }],
    suppliers: [{ id: 's-1', name: 'Acme', email: 'a@b.c' }],
    businesses: [{ id: 'b-1', name: 'Foo', email: 'f@b.c' }],
    products: [{ id: 'p-1', name: 'Widget' }],
    orders: [{ id: 'o-1', poNumber: 'PO-1', status: 'pending' }],
    abuseReports: [{ id: 'r-1', reason: 'spam', status: 'open' }],
  },
}));

vi.mock('../../src/modules/admin/search/searchRepository', () => ({
  searchAll: async (_d1: any, q: string, _limit: number) => state.allResults,
}));

import searchRouter from '../../src/modules/admin/search/searchRoutes';
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
  app.route('/api/admin/search', searchRouter);
  return app;
}

const env = { DB: {} as any } as any;

describe('search', () => {
  it('GET → super_admin sees all groups', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/search?q=foo'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.users?.length).toBe(1);
    expect(body.suppliers?.length).toBe(1);
    expect(body.products?.length).toBe(1);
    expect(body.orders?.length).toBe(1);
    expect(body.abuseReports?.length).toBe(1);
  });

  it('GET → finance sees users + orders + products (no abuse)', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/search?q=foo'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.users?.length).toBe(1);
    expect(body.orders?.length).toBe(1);
    expect(body.products?.length).toBe(1);
    expect(body.abuseReports).toBeUndefined();
  });

  it('GET → support sees users + products + orders + abuse', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/search?q=foo'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.users?.length).toBe(1);
    expect(body.products?.length).toBe(1);
    expect(body.abuseReports?.length).toBe(1);
  });

  it('GET → empty q returns 400', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/search?q='),
      env,
    );
    expect(res.status).toBe(400);
  });
});
