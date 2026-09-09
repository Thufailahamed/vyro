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

const state = vi.hoisted(() => ({
  po: null as any,
  resolved: null as any,
  audit: [] as any[],
  notifications: [] as any[],
  list: [] as any[],
  notify: [] as any[],
}));

vi.mock(setup.SRC + '/modules/notifications/dispatcher', () => ({
  notifyOrderParties: async (
    _d1: any,
    _queue: any,
    _po: any,
    opts: any,
  ) => {
    state.notify.push(opts);
  },
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.po,
          all: async () => state.list,
        }),
      }),
    }),
    update: () => ({
      set: (v: any) => ({
        where: (_c: any) => ({
          run: async () => {
            state.resolved = v;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        const run = async () => {
          if (v && typeof v.action === 'string') state.audit.push(v);
          else state.notifications.push(v);
        };
        return { run, then: (resolve: any, reject: any) => run().then(resolve, reject) };
      },
    }),
  }),
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

import disputeRouter from '../../src/modules/admin/disputes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin', disputeRouter);
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

describe('POST /api/admin/disputes/:poId/resolve', () => {
  beforeEach(() => {
    state.po = null;
    state.resolved = null;
    state.audit = [];
    state.notifications = [];
    state.list = [];
    state.notify = [];
  });

  it('404 when PO not found', async () => {
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/disputes/po-x/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'refund_business' }),
      }),
      env
    );
    expect(res.status).toBe(404);
  });

  it('refund_business → cancelled + audit row + counterparty notification', async () => {
    state.po = { id: 'po-1', status: 'disputed', businessId: 'b-1', supplierId: 's-1' };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/disputes/po-1/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'refund_business', note: 'seller no-show' }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('cancelled');
    expect(state.resolved).toMatchObject({ status: 'cancelled' });
    expect(state.audit[0].action).toBe('dispute.resolved');
    // Both parties notified via dispatcher, never raw insert.
    expect(state.notify.length).toBe(1);
    expect(state.notify[0].type).toBe('dispute.resolved');
    expect(state.notify[0].audience).toBe('both');
    // Order timeline carries the dispute resolution (fromStatus disputed).
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].purchaseOrderId).toBe('po-1');
    expect(state.notifications[0].toStatus).toBe('cancelled');
  });

  it('release_supplier → delivered', async () => {
    state.po = { id: 'po-2', status: 'disputed', businessId: 'b-1', supplierId: 's-1' };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/disputes/po-2/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'release_supplier' }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('delivered');
    expect(state.notify.length).toBe(1);
    expect(state.notify[0].audience).toBe('both');
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].toStatus).toBe('delivered');
  });

  it('409 when PO not in disputed state', async () => {
    state.po = { id: 'po-3', status: 'pending', businessId: 'b-1', supplierId: 's-1' };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/disputes/po-3/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'refund_business' }),
      }),
      env
    );
    expect(res.status).toBe(409);
  });

  it('400 when outcome invalid', async () => {
    state.po = { id: 'po-4', status: 'disputed', businessId: 'b-1', supplierId: 's-1' };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/disputes/po-4/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'banana' }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });
});
