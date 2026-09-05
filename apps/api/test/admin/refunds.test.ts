import { describe, expect, it, vi, beforeEach } from 'vitest';
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
  refunds: [
    {
      id: 'r-1',
      paymentId: 'p-1',
      amountCents: 1000,
      reason: 'duplicate',
      status: 'requested',
      requestedByUserId: 'u-1',
      createdAt: 1000,
    },
    {
      id: 'r-2',
      paymentId: 'p-2',
      amountCents: 500,
      reason: null,
      status: 'completed',
      requestedByUserId: 'u-2',
      createdAt: 500,
    },
  ] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/money/refundsRepository', () => ({
  listRefundQueue: async (_d1: any, opts: any) => {
    let items = state.refunds.slice();
    if (opts.cursor) items = items.filter((r) => r.createdAt < Number(opts.cursor));
    return { items, nextCursor: null };
  },
  getRefund: async (_d1: any, id: string) => state.refunds.find((r) => r.id === id) ?? null,
  setRefundStatus: async (_d1: any, id: string, status: string) => {
    const before = state.refunds.find((r) => r.id === id);
    if (!before) return null;
    before.status = status;
    return before;
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import refundsRouter from '../../src/modules/admin/money/refundsRoutes';
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
  app.route('/api/admin/refunds', refundsRouter);
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

function reset() {
  state.refunds = [
    { id: 'r-1', paymentId: 'p-1', amountCents: 1000, reason: 'dup', status: 'requested', requestedByUserId: 'u-1', createdAt: 1000 },
    { id: 'r-2', paymentId: 'p-2', amountCents: 500, reason: null, status: 'completed', requestedByUserId: 'u-2', createdAt: 500 },
  ];
  state.audit = [];
}

describe('GET /api/admin/refunds/queue', () => {
  beforeEach(reset);
  it('finance → 200 + list', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/refunds/queue', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });
  it('ops → 403', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/refunds/queue', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/refunds/:id/approve', () => {
  beforeEach(reset);
  it('finance approves pending → 200 + audit', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/refunds/r-1/approve', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit.length).toBe(1);
    expect(state.audit[0].action).toBe('refund.approve');
  });
  it('approve already-completed → 409', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/refunds/r-2/approve', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('REFUND_NOT_PENDING');
  });
});

describe('POST /api/admin/refunds/:id/reject', () => {
  beforeEach(reset);
  it('rejects with reason → audit', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/refunds/r-1/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'duplicate confirmed' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('refund.reject');
  });
});
