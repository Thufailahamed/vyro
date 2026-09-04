import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

const state = vi.hoisted(() => ({ respond: [] as any[] }));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_table: any) => ({
        innerJoin: (_other: any) => ({
          where: (_cond: any) => ({
            all: async () => state.respond.shift() ?? [],
          }),
        }),
        where: (_cond: any) => ({
          all: async () => state.respond.shift() ?? [],
          get: async () => state.respond.shift() ?? null,
        }),
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: false, suppliers: [] });
    await next();
  },
}));

import supplierRouter from '../../src/modules/analytics/supplier/routes';
import { errorEnvelope } from '../../src/lib/errors';
import { clearCache } from '../../src/modules/analytics/cache';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/analytics/supplier', supplierRouter);
  return app;
}

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
  ENVIRONMENT: 'test',
} as any;

describe('supplier analytics route', () => {
  beforeEach(() => {
    state.respond = [];
    clearCache();
  });

  it('returns metrics + trend + top products shape', async () => {
    const now = Date.now();
    state.respond = [
      { role: 'owner' },
      [
        { id: 'po1', total: 1000, created: now - 1000, businessId: 'biz-1' },
        { id: 'po2', total: 2000, created: now - 2000, businessId: 'biz-1' },
        { id: 'po3', total: 500, created: now - 3000, businessId: 'biz-2' },
      ],
      [{ status: 'low', lead: 2 }, { status: 'in_stock', lead: 4 }],
      [
        {
          productId: 'sp-a',
          productNameSnapshot: 'Rice',
          qty: 2,
          total: 1000,
        },
        {
          productId: 'sp-a',
          productNameSnapshot: 'Rice',
          qty: 3,
          total: 2000,
        },
      ],
    ];
    const app = buildApp();
    const res = await app.fetch(
      new Request(
        'http://localhost/api/analytics/supplier?supplierId=11111111-1111-1111-1111-111111111111&range=30d',
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.range).toBe('30d');
    expect(body.metrics.revenueCents).toBe(3500);
    expect(body.metrics.ordersCount).toBe(3);
    expect(body.metrics.lowStockCount).toBe(1);
    expect(body.metrics.avgLeadTimeDays).toBe(3);
    expect(body.topProducts[0].revenueCents).toBe(3000);
  });

  it('rejects invalid range', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request(
        'http://localhost/api/analytics/supplier?supplierId=11111111-1111-1111-1111-111111111111&range=1d',
      ),
      env,
    );
    expect(res.status).toBe(400);
  });
});
