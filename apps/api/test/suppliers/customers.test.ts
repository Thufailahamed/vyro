import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const here = typeof __dirname !== 'undefined' ? __dirname : process.cwd() + '/test/suppliers';
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(here, '../../src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

const state = vi.hoisted(() => ({
  member: null as any,
  rows: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        innerJoin: (_o: any) => ({
          where: (_c: any) => ({
            groupBy: (_g: any) => ({
              orderBy: (_o2: any) => ({
                all: async () => state.rows,
              }),
            }),
          }),
        }),
        where: (_c: any) => ({
          get: async () => state.member,
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

import customersRouter from '../../src/modules/suppliers/customers';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/suppliers', customersRouter);
  return app;
}

describe('GET /api/suppliers/:id/customers', () => {
  beforeEach(() => {
    state.member = null;
    state.rows = [];
  });

  const env = {
    DB: {} as any,
    WEB_ORIGIN: 'x',
    ADMIN_ORIGIN: 'x',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'x',
    ENVIRONMENT: 'test',
  } as any;

  it('404 when caller is not a member', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/suppliers/sup-1/customers'),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('returns customer summaries', async () => {
    state.member = { role: 'owner' };
    state.rows = [
      { businessId: 'biz-1', name: 'Acme', totalOrders: 4, totalCents: 50000, lastOrderAt: 2000 },
      { businessId: 'biz-2', name: 'Beta', totalOrders: 1, totalCents: 1000, lastOrderAt: 1000 },
    ];
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/suppliers/sup-1/customers'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(2);
    expect(body.items[0].businessId).toBe('biz-1');
    expect(body.items[0].name).toBe('Acme');
  });
});
