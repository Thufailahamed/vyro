import { describe, it, expect, vi } from 'vitest';
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

vi.mock('../../src/modules/admin/payments/paymentSearchService', () => ({
  listPayments: async () => ({ rows: [], nextCursor: null }),
  getPaymentDetail: async () => null,
  getPaymentOptions: async () => ({ businesses: [], suppliers: [] }),
  getReconciliation: async () => ({
    confirmedOnline: 3,
    pendingOnline: 1,
    failed: 2,
    cancelled: 0,
    chargebacks: 1,
    paymentsWithMultipleEvents: 0,
  }),
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async () => {},
}));

import paymentSearchRoutes from '../../src/modules/admin/payments/paymentSearchRoutes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => { c.set('testRole', 'finance' as AdminRole); await next(); });
  app.route('/api/admin/payments', paymentSearchRoutes);
  return app;
}

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test',
} as any;

describe('GET /api/admin/payments/reconcile', () => {
  it('returns reconciliation shape', async () => {
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/payments/reconcile'),
      env,
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as any;
    expect(j).toEqual({
      confirmedOnline: 3,
      pendingOnline: 1,
      failed: 2,
      cancelled: 0,
      chargebacks: 1,
      paymentsWithMultipleEvents: 0,
    });
  });
});
