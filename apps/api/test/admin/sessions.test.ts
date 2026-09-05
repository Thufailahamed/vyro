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
  sessions: [
    { id: 's-1', userId: 'u-1', expiresAt: Date.now() + 86400000, ip: null, userAgent: null, createdAt: 1000, revokedAt: null, userEmail: 'admin@x.example', userRole: 'super_admin' },
  ] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/security/sessionsRepository', () => ({
  listActiveAdminSessions: async () => state.sessions,
  getSession: async (_d1: any, id: string) => state.sessions.find((s) => s.id === id) ?? null,
  revokeSession: async (_d1: any, id: string, adminId: string, reason: string) => {
    const before = state.sessions.find((s) => s.id === id);
    if (!before) return null;
    const after = { ...before, revokedAt: Date.now(), revokedByAdminId: adminId, revokedReason: reason };
    state.sessions = state.sessions.map((s) => (s.id === id ? after : s));
    return { before, after };
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import sRouter from '../../src/modules/admin/security/sessionsRoutes';
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
  app.route('/api/admin/sessions', sRouter);
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
  state.sessions = [
    { id: 's-1', userId: 'u-1', expiresAt: Date.now() + 86400000, ip: null, userAgent: null, createdAt: 1000, revokedAt: null, userEmail: 'admin@x.example', userRole: 'super_admin' },
  ];
  state.audit = [];
}

describe('admin sessions', () => {
  beforeEach(reset);

  it('GET → super_admin 200', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/sessions', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it('GET → finance 403', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/sessions', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('POST /:id/revoke → super_admin 200 + audit', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/sessions/s-1/revoke', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('session.revoke');
  });
});
