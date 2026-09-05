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
  exports: [] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/security/dataExportRepository', () => ({
  create: async (_d1: any, body: any) => {
    const row = { id: 'exp-1', ...body, status: 'pending', downloadUrl: null, expiresAt: null, createdAt: Date.now() };
    state.exports = [row, ...state.exports];
    return row;
  },
  getExport: async (_d1: any, id: string) => state.exports.find((e) => e.id === id) ?? null,
  markReady: async () => undefined,
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import deRouter from '../../src/modules/admin/security/dataExportRoutes';
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
  app.route('/api/admin/data-export', deRouter);
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
  state.exports = [];
  state.audit = [];
}

describe('data export', () => {
  beforeEach(reset);

  it('POST → super_admin 201 + audit', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/data-export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'u-1' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(state.audit[0].action).toBe('data_export.create');
  });

  it('GET /:id → super_admin 200', async () => {
    state.exports = [
      { id: 'exp-1', userId: 'u-1', requestedBy: 'admin-1', status: 'pending', downloadUrl: null, expiresAt: null, createdAt: 1000 },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/data-export/exp-1', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it('POST → finance 403', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/data-export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'u-1' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
