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
  kyc: [
    { id: 'k-1', userId: 'u-1', status: 'pending', documentsJson: null, notes: null, reviewedBy: null, reviewedAt: null, createdAt: 1000 },
  ] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/trustSafety/kycRepository', () => ({
  listKyc: async (_d1: any, opts: any) => {
    let items = state.kyc;
    if (opts.status) items = items.filter((r) => r.status === opts.status);
    return { items, nextCursor: null };
  },
  getKyc: async (_d1: any, id: string) => state.kyc.find((r) => r.id === id) ?? null,
  createKyc: async (_d1: any, body: any) => {
    const row = { ...body, status: 'pending', notes: null, reviewedBy: null, reviewedAt: null };
    state.kyc = [row, ...state.kyc];
    return row;
  },
  decideKyc: async (_d1: any, id: string, decision: string, notes: string | null, reviewerId: string) => {
    const before = state.kyc.find((r) => r.id === id);
    if (!before) return null;
    const after = { ...before, status: decision, notes, reviewedBy: reviewerId, reviewedAt: Date.now() };
    state.kyc = state.kyc.map((r) => (r.id === id ? after : r));
    return { before, after };
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

const supplierState = vi.hoisted(() => ({
  members: [{ supplierId: 's-1', userId: 'u-1' }],
  verifications: [] as any[],
}));

vi.mock('../../src/modules/suppliers/repository', () => ({
  findSupplierIdByMemberUserId: async (_d1: any, userId: string) =>
    supplierState.members.find((m) => m.userId === userId)?.supplierId ?? null,
  setSupplierVerification: async (_d1: any, id: string, status: string) => {
    supplierState.verifications.push({ id, status });
    return true;
  },
}));

const notifyState = vi.hoisted(() => ({ org: [] as any[], users: [] as any[] }));

vi.mock('../../src/modules/notifications/dispatcher', () => ({
  notifyAdmins: async () => {},
  notifySupplierOrg: async (_d1: any, _q: any, supplierId: string, payload: any) => {
    notifyState.org.push({ supplierId, payload });
  },
  notifyUsers: async (_d1: any, _q: any, userIds: string[], payload: any) => {
    notifyState.users.push({ userIds, payload });
    return [];
  },
}));

import kycRouter from '../../src/modules/admin/trustSafety/kycRoutes';
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
  app.route('/api/admin/kyc', kycRouter);
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
  state.kyc = [
    { id: 'k-1', userId: 'u-1', status: 'pending', documentsJson: null, notes: null, reviewedBy: null, reviewedAt: null, createdAt: 1000 },
  ];
  state.audit = [];
  supplierState.verifications = [];
  notifyState.org = [];
  notifyState.users = [];
}

describe('kyc', () => {
  beforeEach(reset);

  it('GET / → support 200', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/kyc', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it('POST /:id/decision approved → support 200 + audit kyc.approved', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/kyc/k-1/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('kyc.approved');
    expect(supplierState.verifications[0]).toEqual({ id: 's-1', status: 'verified' });
    expect(notifyState.org[0].supplierId).toBe('s-1');
    expect(notifyState.org[0].payload.type).toBe('supplier.verified');
    expect(notifyState.org[0].payload.link).toBe('/supplier/verification');
  });

  it('POST /:id/decision rejected → syncs supplier + notifies org', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/kyc/k-1/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'rejected', notes: 'Blurry BR scan' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(supplierState.verifications[0]).toEqual({ id: 's-1', status: 'rejected' });
    expect(notifyState.org[0].payload.type).toBe('supplier.rejected');
  });

  it('decide already-decided → 409 KYC_NOT_PENDING', async () => {
    state.kyc[0].status = 'approved';
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/kyc/k-1/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'rejected' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('KYC_NOT_PENDING');
  });

  it('POST /:id/decision → finance 403', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/kyc/k-1/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
