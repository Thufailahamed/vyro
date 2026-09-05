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
  batches: [
    { id: 'pb-1', createdBy: 'admin-1', approvedBy: null, status: 'pending', totalCents: 10000, note: null, createdAt: 1000, approvedAt: null },
  ] as any[],
  audit: [] as any[],
  pendingPayouts: 25000,
}));

vi.mock('../../src/modules/admin/money/payoutBatchesRepository', () => ({
  listPendingBatches: async (_d1: any) => ({ items: state.batches, nextCursor: null }),
  getBatch: async (_d1: any, id: string) => state.batches.find((b) => b.id === id) ?? null,
  createBatch: async (_d1: any, data: any) => {
    const b = { ...data, status: 'pending', approvedBy: null, approvedAt: null };
    state.batches.push(b);
    return b;
  },
  approveBatch: async (_d1: any, id: string, approvedBy: string) => {
    const before = state.batches.find((b) => b.id === id);
    if (!before) return null;
    const after = { ...before, status: 'approved', approvedBy, approvedAt: Date.now() };
    state.batches = state.batches.map((b) => (b.id === id ? after : b));
    return { before, after };
  },
  pendingPayoutTotalCents: async () => state.pendingPayouts,
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import payoutsRouter from '../../src/modules/admin/money/payoutBatchesRoutes';
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
  app.route('/api/admin/payouts', payoutsRouter);
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
  state.batches = [
    { id: 'pb-1', createdBy: 'admin-1', approvedBy: null, status: 'pending', totalCents: 10000, note: null, createdAt: 1000, approvedAt: null },
  ];
  state.audit = [];
  state.pendingPayouts = 25000;
}

describe('GET /api/admin/payouts/queue', () => {
  beforeEach(reset);
  it('finance → 200', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/payouts/queue', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });
  it('non-admin → 403', async () => {
    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/payouts/queue', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/payouts/batch', () => {
  beforeEach(reset);
  it('finance creates → 201 + audit', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/payouts/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'weekly' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(state.audit[0].action).toBe('payout.batch.create');
    expect((state.batches[state.batches.length - 1] as any).totalCents).toBe(25000);
  });
});

describe('POST /api/admin/payouts/:batchId/approve', () => {
  beforeEach(reset);
  it('finance approves pending → 200 + audit', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/payouts/pb-1/approve', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('payout.approve');
  });
  it('approve already-approved → 409', async () => {
    state.batches[0].status = 'approved';
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/payouts/pb-1/approve', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('BATCH_ALREADY_APPROVED');
  });
});
