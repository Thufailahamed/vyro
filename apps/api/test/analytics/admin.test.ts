import { describe, expect, it, vi, beforeEach } from 'vitest';
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

const state = vi.hoisted(() => ({ respond: [] as any[] }));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_table: any) => ({
        where: (_cond: any) => ({
          all: async () => state.respond.shift() ?? [],
          get: async () => state.respond.shift() ?? null,
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: () => ({ run: async () => {} }),
        run: async () => {
          void v;
        },
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (_c: any, next: any) => {
    await next();
  },
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => {
    await next();
  },
}));

import adminRouter from '../../src/modules/analytics/admin/routes';
import { errorEnvelope } from '../../src/lib/errors';
import { clearCache } from '../../src/modules/analytics/cache';
import { getPlatformSettings } from '../../src/modules/settings/adminRepository';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/analytics/admin', adminRouter);
  return app;
}

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
  ENVIRONMENT: 'test',
} as any;

describe('admin analytics', () => {
  beforeEach(() => {
    state.respond = [];
    clearCache();
  });

  it('computes zero metrics for empty data', async () => {
    void getPlatformSettings;
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/analytics/admin?range=30d'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.range).toBe('30d');
    expect(body.metrics.gmvCents).toBe(0);
    expect(body.metrics.takeRateCents).toBe(0);
    expect(body.metrics.disputeRate).toBe(0);
    expect(body.metrics.completionRate).toBe(0);
  });
});
