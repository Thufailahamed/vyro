import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AdminRole } from '@vyro/auth';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test',
  },
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    const role = (c.get('testRole') ?? null) as AdminRole | null;
    c.set('ctx', { userId: 'admin-1', email: 'a@x', isAdmin: role !== null, adminRole: role, businesses: [], suppliers: [] });
    await n();
  },
}));

const state = vi.hoisted(() => ({
  list: [{ id: 'p1', amountCents: 100 }] as any[],
  detail: null as any,
  options: { businesses: [{ id: 'b1', name: 'Biz' }], suppliers: [] } as any,
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/payments/paymentSearchService', () => ({
  listPayments: async (_d1: any, _f: any) => ({ rows: state.list, nextCursor: null }),
  getPaymentDetail: async (_d1: any, id: string) => (id === 'p1' ? state.detail : null),
  getPaymentOptions: async (_d1: any) => state.options,
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => { state.audit.push(opts); },
}));

import paymentSearchRoutes from '../../src/modules/admin/payments/paymentSearchRoutes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp(adminRole: AdminRole | null) {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => { c.set('testRole', adminRole); await next(); });
  app.route('/api/admin/payments', paymentSearchRoutes);
  return app;
}

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test',
} as any;

describe('GET /api/admin/payments', () => {
  beforeEach(() => {
    state.list = [{ id: 'p1', amountCents: 100 }];
    state.audit = [];
  });

  it('finance → 200 with rows', async () => {
    const res = await buildApp('finance').fetch(new Request('http://localhost/api/admin/payments'), env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.payments).toEqual([{ id: 'p1', amountCents: 100 }]);
  });

  it('ops → 403', async () => {
    const res = await buildApp('ops').fetch(new Request('http://localhost/api/admin/payments'), env);
    expect(res.status).toBe(403);
  });

  it('super_admin → 200', async () => {
    const res = await buildApp('super_admin').fetch(new Request('http://localhost/api/admin/payments'), env);
    expect(res.status).toBe(200);
  });

  it('support → 200 (has payment:read)', async () => {
    const res = await buildApp('support').fetch(new Request('http://localhost/api/admin/payments'), env);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/payments/:id', () => {
  beforeEach(() => {
    state.detail = { payment: { id: 'p1' }, refunds: [], chargebacks: [], ledger: [] };
    state.audit = [];
  });

  it('returns detail + audits payment.view', async () => {
    const res = await buildApp('finance').fetch(new Request('http://localhost/api/admin/payments/p1'), env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.payment.id).toBe('p1');
    expect(state.audit[0].action).toBe('payment.view');
    expect(state.audit[0].target).toEqual({ type: 'payment', id: 'p1' });
  });

  it('missing → 404', async () => {
    const res = await buildApp('finance').fetch(new Request('http://localhost/api/admin/payments/absent'), env);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/payments/options', () => {
  beforeEach(() => {
    state.options = { businesses: [{ id: 'b1', name: 'Biz' }], suppliers: [] };
  });

  it('returns options', async () => {
    const res = await buildApp('finance').fetch(new Request('http://localhost/api/admin/payments/options'), env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.businesses).toEqual([{ id: 'b1', name: 'Biz' }]);
  });
});
