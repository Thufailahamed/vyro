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
  cbs: [
    { id: 'cb-1', paymentId: 'pay-1', reason: 'fraud', status: 'open', resolvedBy: null, resolvedAt: null, refundId: null, notes: null, createdAt: 1000 },
  ] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/money/chargebacksRepository', () => ({
  listOpen: async (_d1: any) => state.cbs.filter((c) => c.status === 'open'),
  getChargeback: async (_d1: any, id: string) => state.cbs.find((c) => c.id === id) ?? null,
  resolveChargeback: async (_d1: any, id: string, resolvedBy: string, notes: string | null, refundId: string | null) => {
    const before = state.cbs.find((c) => c.id === id);
    if (!before) return null;
    const after = { ...before, status: 'resolved', resolvedBy, resolvedAt: Date.now(), notes, refundId };
    state.cbs = state.cbs.map((c) => (c.id === id ? after : c));
    return { before, after };
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import cbRouter from '../../src/modules/admin/money/chargebacksRoutes';
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
  app.route('/api/admin/chargebacks', cbRouter);
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
  state.cbs = [
    { id: 'cb-1', paymentId: 'pay-1', reason: 'fraud', status: 'open', resolvedBy: null, resolvedAt: null, refundId: null, notes: null, createdAt: 1000 },
  ];
  state.audit = [];
}

describe('GET /api/admin/chargebacks', () => {
  beforeEach(reset);
  it('finance → 200', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/chargebacks', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/chargebacks/:id/resolve', () => {
  beforeEach(reset);
  it('finance resolves → 200 + audit', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/chargebacks/cb-1/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: 'handled' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('chargeback.resolve');
  });
  it('resolve already-resolved → 409', async () => {
    state.cbs[0].status = 'resolved';
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/chargebacks/cb-1/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: 'again' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CHARGEBACK_RESOLVED');
  });
});
