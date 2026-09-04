import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  member: null as any,
  roles: { role: null as any },
  rows: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        innerJoin: (_o: any) => ({
          where: (_c: any) => ({
            orderBy: (_o2: any) => ({
              limit: (_l: number) => ({
                all: async () => state.rows,
              }),
            }),
          }),
        }),
        where: (_c: any) => ({
          get: async () => state.member,
          all: async () => [],
        }),
      }),
    }),
  }),
}));

vi.mock(setup.SRC + '/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: false });
    await next();
  },
}));

import listRouter from '../../src/modules/payments/listRepository';
import { errorEnvelope } from '../../src/lib/errors';

// We will test the router through the existing /api/payments routes, but listRepository
// only exposes data-layer. Instead, build a minimal driver route here:

import { Hono as H } from 'hono';
import { session as sess } from '../../src/middleware/session';
import { httpError } from '../../src/lib/errors';
import { listPaymentsForSupplier, requireSupplierMember } from '../../src/modules/payments/listRepository';

const r = new H();
r.use('*', sess());
r.get('/', async (c) => {
  const ctx = c.get('ctx') as any;
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  try {
    await requireSupplierMember(c.env.DB, supplierId, ctx.userId);
  } catch {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const cursorRaw = c.req.query('cursor');
  const cursor = cursorRaw ? Number(cursorRaw) : undefined;
  const status = c.req.query('status');
  const items = await listPaymentsForSupplier(c.env.DB, supplierId, cursor, status);
  return c.json({ items });
});

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/payments', r);
  return app;
}

describe('GET /api/payments?supplierId=', () => {
  beforeEach(() => {
    state.member = null;
    state.rows = [];
  });
  const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

  it('404 when caller not a member', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/payments?supplierId=sup-1'), env);
    expect(res.status).toBe(404);
  });

  it('returns rows', async () => {
    state.member = { role: 'manager' };
    state.rows = [
      { id: 'pay-1', purchaseOrderId: 'po-1', supplierId: 'sup-1', amountCents: 10000, status: 'pending', createdAt: 2000 },
    ];
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/payments?supplierId=sup-1'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items[0].id).toBe('pay-1');
    expect(body.items[0].amountCents).toBe(10000);
  });

  it('rejects missing supplierId', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/payments'), env);
    expect(res.status).toBe(400);
  });
});
