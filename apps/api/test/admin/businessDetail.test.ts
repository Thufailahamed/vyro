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
  business: null as any,
  members: [] as any[],
  recentOrders: [] as any[],
  orderCountRows: [] as any[],
  allQueue: [] as any[][],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.business,
          orderBy: (_o: any) => ({
            limit: (_n: number) => ({
              all: async () => state.recentOrders,
            }),
          }),
          all: async () => state.orderCountRows,
        }),
        innerJoin: (_t2: any) => ({
          where: (_c: any) => ({
            all: async () => state.members,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock(setup.SRC + '/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => { await next(); },
}));

import businessDetailRouter from '../../src/modules/admin/businessDetail';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin', businessDetailRouter);
  return app;
}

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('GET /api/admin/businesses/:id', () => {
  beforeEach(() => {
    state.business = null;
    state.members = [];
    state.recentOrders = [];
    state.orderCountRows = [];
  });

  it('404 when business not found', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/businesses/biz-1'), env);
    expect(res.status).toBe(404);
  });

  it('200 with members + recent orders', async () => {
    state.business = { id: 'biz-1', name: 'Acme Co', status: 'active', createdAt: 1000 };
    state.members = [{ userId: 'u-1', role: 'owner', email: 'a@b.com' }];
    state.recentOrders = [
      { id: 'po-1', status: 'delivered', totalCents: 5000, createdAt: 2000 },
    ];
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/businesses/biz-1'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.business.name).toBe('Acme Co');
    expect(body.business.members).toHaveLength(1);
    expect(body.business.recentOrders).toHaveLength(1);
    expect(body.business.recentOrders[0].totalCents).toBe(5000);
  });
});
