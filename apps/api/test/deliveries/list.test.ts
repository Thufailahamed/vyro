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

import listRouter from '../../src/modules/deliveries/list';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/deliveries', listRouter);
  return app;
}

describe('GET /api/deliveries?supplierId=', () => {
  beforeEach(() => {
    state.member = null;
    state.rows = [];
  });
  const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

  it('404 when caller not a member', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/deliveries?supplierId=sup-1'),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('returns rows filtered by supplier', async () => {
    state.member = { role: 'manager' };
    state.rows = [
      { id: 'd-1', purchaseOrderId: 'po-1', supplierId: 'sup-1', status: 'in_transit', estimatedAt: 1000, deliveredAt: null, driverName: 'Driver A' },
    ];
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/deliveries?supplierId=sup-1'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items[0].id).toBe('d-1');
    expect(body.items[0].driverName).toBe('Driver A');
  });

  it('rejects missing supplierId', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/deliveries'), env);
    expect(res.status).toBe(400);
  });
});
