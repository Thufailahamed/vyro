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
  entries: [
    { accountType: 'supplier', direction: 'credit', amountCents: 1000, refType: 'payment' },
    { accountType: 'supplier', direction: 'debit', amountCents: 200, refType: 'fee' },
    { accountType: 'platform', direction: 'credit', amountCents: 50, refType: 'fee' },
  ] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          all: async () => state.entries,
        }),
      }),
    }),
  }),
}));

import ledgerRouter from '../../src/modules/admin/money/ledgerRoutes';
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
  app.route('/api/admin/ledger', ledgerRouter);
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

describe('GET /api/admin/ledger/summary', () => {
  beforeEach(() => {
    state.entries = [
      { accountType: 'supplier', direction: 'credit', amountCents: 1000, refType: 'payment' },
      { accountType: 'supplier', direction: 'debit', amountCents: 200, refType: 'fee' },
      { accountType: 'platform', direction: 'credit', amountCents: 50, refType: 'fee' },
    ];
  });

  it('finance → 200 + summary', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/ledger/summary', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.totalCreditCents).toBe(1050);
    expect(body.totalDebitCents).toBe(200);
    expect(body.netCents).toBe(850);
    expect(body.byAccountType.length).toBe(2);
  });

  it('ops → 403', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/ledger/summary', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
