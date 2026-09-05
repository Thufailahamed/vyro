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
  reports: [
    {
      id: 'rep-1',
      reporterUserId: null,
      targetType: 'product',
      targetId: 'p-1',
      reason: 'spam',
      details: null,
      status: 'open',
      assignedTo: null,
      resolutionNotes: null,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/trustSafety/abuseReportsRepository', () => ({
  listReports: async (_d1: any, opts: any) => {
    let items = state.reports;
    if (opts.status) items = items.filter((r) => r.status === opts.status);
    if (opts.unassigned) items = items.filter((r) => r.assignedTo === null);
    if (opts.assignedTo) items = items.filter((r) => r.assignedTo === opts.assignedTo);
    return { items, nextCursor: null };
  },
  getReport: async (_d1: any, id: string) => state.reports.find((r) => r.id === id) ?? null,
  claimReport: async (_d1: any, id: string, assignedTo: string) => {
    const before = state.reports.find((r) => r.id === id);
    if (!before) return null;
    const after = { ...before, assignedTo, status: 'investigating', updatedAt: Date.now() };
    state.reports = state.reports.map((r) => (r.id === id ? after : r));
    return { before, after };
  },
  resolveReport: async (_d1: any, id: string, resolution: string, notes: string | null) => {
    const before = state.reports.find((r) => r.id === id);
    if (!before) return null;
    const after = { ...before, status: resolution, resolutionNotes: notes, updatedAt: Date.now() };
    state.reports = state.reports.map((r) => (r.id === id ? after : r));
    return { before, after };
  },
  setReportInactiveTarget: async (_d1: any, id: string) => {
    const before = state.reports.find((r) => r.id === id);
    if (!before) return null;
    const after = { ...before, status: 'resolved', resolutionNotes: 'takedown', updatedAt: Date.now() };
    state.reports = state.reports.map((r) => (r.id === id ? after : r));
    return after;
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import arRouter from '../../src/modules/admin/trustSafety/abuseReportsRoutes';
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
  app.route('/api/admin/abuse-reports', arRouter);
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
  state.reports = [
    {
      id: 'rep-1',
      reporterUserId: null,
      targetType: 'product',
      targetId: 'p-1',
      reason: 'spam',
      details: null,
      status: 'open',
      assignedTo: null,
      resolutionNotes: null,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];
  state.audit = [];
}

describe('abuse reports', () => {
  beforeEach(reset);

  it('GET / → support 200', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/abuse-reports', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it('GET / → finance 403 (no abuse_report:read)', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/abuse-reports', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('POST /:id/claim → support 200 + audit', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/abuse-reports/rep-1/claim', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('abuse_report.claim');
  });

  it('POST /:id/resolve → support 200', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/abuse-reports/rep-1/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution: 'resolved' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('abuse_report.resolve');
  });

  it('POST /:id/resolve already-resolved → 409', async () => {
    state.reports[0].status = 'resolved';
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/abuse-reports/rep-1/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution: 'dismissed' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('ABUSE_REPORT_NOT_OPEN');
  });

  it('POST /:id/takedown → support 200 + audit takedown.create', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/abuse-reports/rep-1/takedown', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    const takedownAudit = state.audit.find((a: any) => a.action === 'takedown.create');
    expect(takedownAudit).toBeTruthy();
  });
});
