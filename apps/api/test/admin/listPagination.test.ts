import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: {
    WEB_ORIGIN: 'x',
    ADMIN_ORIGIN: 'x',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'x',
    ENVIRONMENT: 'test',
  },
}));

type Row = { id: string; name: string; status: 'active' | 'suspended'; createdAt: number };

const state = vi.hoisted(() => ({
  suppliers: [
    { id: 's-3', name: 'Coco Lanka', status: 'active', createdAt: 3000 },
    { id: 's-2', name: 'Beta Traders', status: 'active', createdAt: 2000 },
    { id: 's-1', name: 'Alpha Co', status: 'suspended', createdAt: 1000 },
  ] as Row[],
  businesses: [
    { id: 'b-2', name: 'Bistro One', status: 'active', createdAt: 2000 },
    { id: 'b-1', name: 'Alpha Mart', status: 'suspended', createdAt: 1000 },
  ] as Row[],
  audit: [
    { id: 'l-3', action: 'a.b', resourceType: 't', resourceId: 'r', actorUserId: 'u1', createdAt: 3000, metadata: null, ip: null, userAgent: null },
    { id: 'l-2', action: 'a.a', resourceType: 't', resourceId: 'r', actorUserId: 'u2', createdAt: 2000, metadata: null, ip: null, userAgent: null },
    { id: 'l-1', action: 'a.b', resourceType: 't', resourceId: 'r', actorUserId: 'u1', createdAt: 1000, metadata: null, ip: null, userAgent: null },
  ] as any[],
  currentTable: null as null | 'suppliers' | 'businesses' | 'audit',
}));

function buildChain(rows: () => any[]): any {
  const chain: any = {
    where: (cond: any) => {
      const filtered = rows().filter((r) => matches(r, cond));
      return buildChain(() => filtered);
    },
    orderBy: () => chain,
    limit: () => chain,
    all: async () => rows(),
  };
  return chain;
}

function matches(row: any, cond: any): boolean {
  if (!cond) return true;
  if (cond.kind === 'and') return (cond.args as any[]).every((c) => matches(row, c));
  if (cond.kind === 'eq') return row[cond.col?.name ?? cond.col] === cond.val;
  if (cond.kind === 'like') return String(row[cond.col?.name ?? cond.col] ?? '').includes(String(cond.val).replace(/%/g, ''));
  if (cond.kind === 'lt') return Number(row[cond.col?.name ?? cond.col]) < Number(cond.val);
  return true;
}

vi.mock('drizzle-orm', () => {
  const stub: any = {};
  stub.sql = (strings: TemplateStringsArray, ...values: any[]) => ({ kind: 'sql', strings, values });
  stub.and = (...args: any[]) => ({ kind: 'and', args });
  stub.eq = (col: any, val: any) => ({ kind: 'eq', col, val });
  stub.like = (col: any, val: any) => ({ kind: 'like', col, val });
  stub.lt = (col: any, val: any) => ({ kind: 'lt', col, val });
  stub.desc = (col: any) => ({ kind: 'desc', col });
  stub.asc = (col: any) => ({ kind: 'asc', col });
  return stub;
});

vi.mock('@vyro/db', () => {
  // Use sentinel objects as table refs; the route imports the real schema, but we re-export
  // our sentinels here so the route picks them up when it resolves `@vyro/db/schema`. However,
  // the route imports `@vyro/db/schema` directly, not via `@vyro/db`, so this only mocks getDb.
  return {
    getDb: () => ({
      select: () => ({
        from: (t: any) => {
          const key = (t && t.__vyroMockKey) as string | undefined;
          const fn =
            key === 'suppliers' ? () => state.suppliers :
            key === 'businesses' ? () => state.businesses :
            () => state.audit;
          return buildChain(fn);
        },
      }),
    }),
  };
});

// Also mock the schema barrel — replace each table with a tagged ref so from() can dispatch.
vi.mock('@vyro/db/schema', () => ({
  suppliers: { __vyroMockKey: 'suppliers', name: { name: 'name' }, status: { name: 'status' }, createdAt: { name: 'createdAt' } },
  businesses: { __vyroMockKey: 'businesses', name: { name: 'name' }, status: { name: 'status' }, createdAt: { name: 'createdAt' } },
  auditLogs: { __vyroMockKey: 'audit', action: { name: 'action' }, resourceType: { name: 'resourceType' }, actorUserId: { name: 'actorUserId' }, createdAt: { name: 'createdAt' } },
  purchaseOrders: { __vyroMockKey: 'audit' },
  users: {},
  sessions: {},
  businessMembers: {},
  supplierMembers: {},
}));

vi.mock(setup.SRC + '/middleware/requireRole', () => ({
  requireRole: () => async (_c: any, n: any) => {
    await n();
  },
}));
vi.mock(setup.SRC + '/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    c.set('ctx', { userId: 'admin-1', isAdmin: true, businesses: [], suppliers: [] });
    await n();
  },
}));

import adminRouter from '../../src/modules/admin/routes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin', adminRouter);
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

describe('GET /api/admin/suppliers', () => {
  beforeEach(() => {
    state.suppliers = [
      { id: 's-3', name: 'Coco Lanka', status: 'active', createdAt: 3000 },
      { id: 's-2', name: 'Beta Traders', status: 'active', createdAt: 2000 },
      { id: 's-1', name: 'Alpha Co', status: 'suspended', createdAt: 1000 },
    ];
  });

  it('returns all suppliers when no filter', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.suppliers).toHaveLength(3);
    expect(body.nextCursor).toBeUndefined();
  });

  it('filters by q (name LIKE)', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers?q=Alpha'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.suppliers.map((r: Row) => r.id)).toEqual(['s-1']);
  });

  it('filters by status', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers?status=suspended'), env);
    const body = (await res.json()) as any;
    expect(body.suppliers.map((r: Row) => r.id)).toEqual(['s-1']);
  });
});

describe('GET /api/admin/businesses', () => {
  beforeEach(() => {
    state.businesses = [
      { id: 'b-2', name: 'Bistro One', status: 'active', createdAt: 2000 },
      { id: 'b-1', name: 'Alpha Mart', status: 'suspended', createdAt: 1000 },
    ];
  });

  it('returns businesses with pagination shape', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/businesses'), env);
    const body = (await res.json()) as any;
    expect(body.businesses).toHaveLength(2);
  });

  it('filters by status', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/businesses?status=active'), env);
    const body = (await res.json()) as any;
    expect(body.businesses.map((r: Row) => r.id)).toEqual(['b-2']);
  });
});

describe('GET /api/admin/audit', () => {
  it('returns audit logs', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/audit'), env);
    const body = (await res.json()) as any;
    expect(body.logs).toHaveLength(3);
  });

  it('400 on invalid query', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/audit?limit=abc'), env);
    expect(res.status).toBe(400);
  });
});
