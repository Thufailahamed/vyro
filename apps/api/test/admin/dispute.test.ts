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
  transitions: [] as any[],
  refundAll: [] as any[],
  refundAmount: [] as any[],
  released: [] as any[],
}));

// Status + money are delegated: the pipeline and executor have their own
// integration tests (test/orders/lifecycle.test.ts). Here we assert the
// resolution contract — which money moves, which state the order ends in.
vi.mock(setup.SRC + '/modules/orders/lifecycle', () => ({
  applyTransition: async (_env: any, input: any) => {
    state.transitions.push(input);
    return { ok: true, from: 'disputed', to: input.to, refunds: [] };
  },
}));
vi.mock(setup.SRC + '/modules/refunds/executor', () => ({
  refundAllForOrder: async (_env: any, args: any) => {
    state.refundAll.push(args);
    return [{ refundId: 'rf-1', status: 'completed', amountCents: 5000, reused: false }];
  },
  refundAmountForOrder: async (_env: any, args: any) => {
    state.refundAmount.push(args);
    return { refunds: [{ refundId: 'rf-2', status: 'completed', amountCents: args.amountCents, reused: false }], unrefundedCents: 0 };
  },
}));
vi.mock(setup.SRC + '/modules/credit/service', () => ({
  releaseDrawdown: async (_d1: any, args: any) => {
    state.released.push(args);
    return null;
  },
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
    state.transitions = [];
    state.refundAll = [];
    state.refundAmount = [];
    state.released = [];
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

  it('refund_business → full refund + credit release, then cancelled via the pipeline', async () => {
    state.po = { id: 'po-1', poNumber: 'PO-1', status: 'disputed', businessId: 'b-1', supplierId: 's-1', totalCents: 5000 };
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
    expect(state.refundAll).toHaveLength(1);
    expect(state.refundAll[0]).toMatchObject({ poId: 'po-1', source: 'dispute', keyPrefix: 'dispute:po-1' });
    expect(state.released).toHaveLength(1);
    // Money is settled by the resolver, so the pipeline must not refund again.
    expect(state.transitions).toHaveLength(1);
    expect(state.transitions[0]).toMatchObject({
      poId: 'po-1',
      to: 'cancelled',
      actor: { role: 'admin', userId: 'admin-1' },
      reason: 'seller no-show',
      opts: { disputeResolution: 'refund_business', skipRefund: true, expectedFrom: 'disputed' },
    });
    expect(state.audit[0].action).toBe('dispute.resolved');
    // Both parties notified via dispatcher, never raw insert.
    expect(state.notify.length).toBe(1);
    expect(state.notify[0].type).toBe('dispute.resolved');
    expect(state.notify[0].audience).toBe('both');
  });

  it('release_supplier → completed (funds become payable), no refund', async () => {
    state.po = { id: 'po-2', poNumber: 'PO-2', status: 'disputed', businessId: 'b-1', supplierId: 's-1', totalCents: 5000 };
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
    expect(body.status).toBe('completed');
    expect(state.refundAll).toHaveLength(0);
    expect(state.refundAmount).toHaveLength(0);
    expect(state.transitions[0]).toMatchObject({ to: 'completed', opts: { disputeResolution: 'release_supplier' } });
    expect(state.notify.length).toBe(1);
    expect(state.notify[0].audience).toBe('both');
  });

  it('partial → refunds only the awarded amount, then completed', async () => {
    state.po = { id: 'po-5', poNumber: 'PO-5', status: 'disputed', businessId: 'b-1', supplierId: 's-1', totalCents: 10000 };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/disputes/po-5/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'partial', amountCents: 2500, note: '5 bags damaged' }),
      }),
      env
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).status).toBe('completed');
    expect(state.refundAmount).toHaveLength(1);
    expect(state.refundAmount[0]).toMatchObject({ poId: 'po-5', amountCents: 2500, source: 'dispute' });
    expect(state.refundAll).toHaveLength(0);
    expect(state.transitions[0]).toMatchObject({ to: 'completed', opts: { disputeResolution: 'partial', skipRefund: true } });
  });

  it('partial without an amount → 400; partial ≥ total → 400', async () => {
    state.po = { id: 'po-6', poNumber: 'PO-6', status: 'disputed', businessId: 'b-1', supplierId: 's-1', totalCents: 1000 };
    const noAmount = await buildApp().fetch(
      new Request('http://localhost/api/admin/disputes/po-6/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'partial' }),
      }),
      env
    );
    expect(noAmount.status).toBe(400);
    const tooMuch = await buildApp().fetch(
      new Request('http://localhost/api/admin/disputes/po-6/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome: 'partial', amountCents: 1000 }),
      }),
      env
    );
    expect(tooMuch.status).toBe(400);
    expect(state.transitions).toHaveLength(0);
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
