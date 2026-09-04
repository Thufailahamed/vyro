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
  po: null as any,
  events: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.po,
          orderBy: (_o: any) => ({
            all: async () => state.events,
          }),
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

import eventsRouter from '../../src/modules/purchaseOrders/events';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/purchase-orders', eventsRouter);
  return app;
}

describe('GET /api/purchase-orders/:id/events', () => {
  beforeEach(() => {
    state.po = null;
    state.events = [];
  });
  const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

  it('404 when PO does not exist', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/purchase-orders/po-1/events'),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('returns events for an existing PO', async () => {
    state.po = { id: 'po-1', supplierId: 'sup-1', businessId: 'biz-1' };
    state.events = [
      { id: 'e-1', purchaseOrderId: 'po-1', fromStatus: null, toStatus: 'pending', actorUserId: 'u-2', reason: null, metadata: null, createdAt: 1000 },
      { id: 'e-2', purchaseOrderId: 'po-1', fromStatus: 'pending', toStatus: 'dispatched', actorUserId: 'u-1', reason: null, metadata: null, createdAt: 2000 },
    ];
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/purchase-orders/po-1/events'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.events).toHaveLength(2);
    expect(body.events[0].toStatus).toBe('pending');
  });
});
