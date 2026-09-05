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
  imps: [] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/security/impersonationRepository', () => ({
  start: async (_d1: any, body: any) => {
    const row = { ...body, id: 'imp-1', startedAt: Date.now(), endedAt: null };
    state.imps = [row, ...state.imps];
    return row;
  },
  findActive: async (_d1: any, adminUserId: string) =>
    state.imps.find((i) => i.adminUserId === adminUserId && i.endedAt === null) ?? null,
  end: async (_d1: any, id: string) => {
    const before = state.imps.find((i) => i.id === id);
    if (!before) return null;
    if (before.endedAt) return before;
    const after = { ...before, endedAt: Date.now() };
    state.imps = state.imps.map((i) => (i.id === id ? after : i));
    return after;
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import impRouter from '../../src/modules/admin/security/impersonationRoutes';
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
  app.route('/api/admin/impersonate', impRouter);
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
  state.imps = [];
  state.audit = [];
}

describe('impersonation', () => {
  beforeEach(reset);

  it('POST start → super_admin 201 + audit impersonation.start', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: 'u-buyer', reason: 'support escalation needed' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(state.audit[0].action).toBe('impersonation.start');
  });

  it('POST start → finance 403', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: 'u-buyer', reason: 'support escalation needed' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('POST start twice → 409 conflict', async () => {
    await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: 'u-buyer', reason: 'first call' }),
      }),
      env,
    );
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: 'u-other', reason: 'second call' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
  });

  it('POST /end → 200 + audit impersonation.end', async () => {
    await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: 'u-buyer', reason: 'first call' }),
      }),
      env,
    );
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/impersonate/end', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    const endAudit = state.audit.find((a: any) => a.action === 'impersonation.end');
    expect(endAudit).toBeTruthy();
  });
});
