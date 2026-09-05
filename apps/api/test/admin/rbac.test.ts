import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

import { requirePermission } from '../../src/middleware/rbac';
import { errorEnvelope } from '../../src/lib/errors';
import type { AdminRole } from '@vyro/auth';

function appWith(adminRole: AdminRole | null) {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => {
    c.set('ctx', {
      userId: 'u1',
      email: 'a@x.example',
      isAdmin: adminRole !== null,
      adminRole,
      businesses: [],
      suppliers: [],
    } as any);
    await next();
  });
  app.get('/probe', requirePermission('user:suspend'), (c) => c.json({ ok: true }));
  app.get('/probe-rc', requirePermission('admin:role_change'), (c) => c.json({ ok: true }));
  return app;
}

describe('requirePermission', () => {
  it('super_admin passes user:suspend', async () => {
    const res = await appWith('super_admin').request('/probe');
    expect(res.status).toBe(200);
  });
  it('finance blocked from user:suspend', async () => {
    const res = await appWith('finance').request('/probe');
    expect(res.status).toBe(403);
  });
  it('null role blocked', async () => {
    const res = await appWith(null).request('/probe');
    expect(res.status).toBe(403);
  });
  it('ops passes user:suspend', async () => {
    const res = await appWith('ops').request('/probe');
    expect(res.status).toBe(200);
  });
  it('super_admin passes admin:role_change', async () => {
    const res = await appWith('super_admin').request('/probe-rc');
    expect(res.status).toBe(200);
  });
  it('ops blocked from admin:role_change', async () => {
    const res = await appWith('ops').request('/probe-rc');
    expect(res.status).toBe(403);
  });
});
