import { describe, expect, it, vi } from 'vitest';
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
  snapshot: {
    dbLatencyMs: 5,
    pendingWebhookDeliveries: 2,
    failedWebhookDeliveries24h: 1,
    openAbuseReports: 3,
    pendingKyc: 4,
    pendingRefunds: 5,
    recentErrors: [{ action: 'x', createdAt: 0, status: null }],
    capturedAt: 100,
  },
}));

vi.mock('../../src/modules/admin/observability/healthService', () => ({
  snapshot: async () => state.snapshot,
}));

import healthRouter from '../../src/modules/admin/observability/healthRoutes';
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
  app.route('/api/admin/health/dashboard', healthRouter);
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

describe('health', () => {
  it('GET → super_admin 200 with snapshot', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/health/dashboard', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.pendingRefunds).toBe(5);
  });

  it('GET → ops 200', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/health/dashboard', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it('GET → support 403', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/health/dashboard', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
