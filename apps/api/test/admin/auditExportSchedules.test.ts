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
  schedules: [] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/audit/exportSchedulesRepository', () => ({
  list: async (_d1: any, _by: string) => state.schedules,
  insert: async (_d1: any, row: any) => {
    state.schedules = [row, ...state.schedules];
    return row;
  },
  cancel: async (_d1: any, id: string, _by: string) => {
    const before = state.schedules.find((s) => s.id === id);
    if (!before) return null;
    const after = { ...before, active: false, updatedAt: Date.now() };
    state.schedules = state.schedules.map((s) => (s.id === id ? after : s));
    return { before, after };
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import exportSchedulesRouter from '../../src/modules/admin/audit/exportSchedulesRoutes';
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
  app.route('/api/admin/audit/exports', exportSchedulesRouter);
  return app;
}

const env = { DB: {} as any } as any;

function reset() {
  state.schedules = [];
  state.audit = [];
}

describe('audit export schedules', () => {
  beforeEach(reset);

  it('POST → super_admin 201 + audit', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frequency: 'daily', email: 'a@b.c', format: 'csv' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(state.audit[0].action).toBe('audit_export.create');
  });

  it('POST → finance 403 (no audit:export)', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/audit/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frequency: 'daily', email: 'a@b.c', format: 'csv' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('POST → invalid body 400', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frequency: 'hourly', email: 'not-an-email' }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('GET → lists schedules', async () => {
    state.schedules = [{ id: 'sc-1', requestedBy: 'admin-1', frequency: 'daily', email: 'a@b.c', format: 'csv', nextRunAt: 0, active: true, lastRunAt: null, createdAt: 0, updatedAt: 0 }];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit/exports', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.schedules.length).toBe(1);
  });

  it('DELETE → cancel + audit', async () => {
    state.schedules = [{ id: 'sc-1', requestedBy: 'admin-1', frequency: 'daily', email: 'a@b.c', format: 'csv', nextRunAt: 0, active: true, lastRunAt: null, createdAt: 0, updatedAt: 0 }];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit/exports/sc-1', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('audit_export.cancel');
    expect(state.schedules[0].active).toBe(false);
  });

  it('DELETE → unknown id 404', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit/exports/nope', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(404);
  });
});
