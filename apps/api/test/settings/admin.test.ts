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

const mockState = vi.hoisted(() => ({
  platformRow: null as any,
  auditRows: [] as any[],
  platformWrites: 0,
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_table: any) => ({
        where: (_cond: any) => ({
          get: async () => mockState.platformRow,
        }),
      }),
    }),
    insert: (_table: any) => ({
      values: (vals: any) => ({
        onConflictDoUpdate: (_opts: any) => ({
          run: async () => {
            mockState.platformWrites += 1;
            mockState.platformRow = vals;
            return {};
          },
        }),
        run: async () => {
          mockState.auditRows.push(vals);
          return {};
        },
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'admin-1', isAdmin: true });
    await next();
  },
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => {
    await next();
  },
}));

import adminRouter from '../../src/modules/settings/admin';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin/settings', adminRouter);
  return app;
}

describe('settings admin routes', () => {
  beforeEach(() => {
    mockState.platformRow = null;
    mockState.auditRows.length = 0;
    mockState.platformWrites = 0;
  });

  const env = {
    DB: {} as any,
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  } as any;

  it('GET returns seed defaults', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/admin/settings'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.settings.brandName).toBe('VYRO');
    expect(body.settings.platformFeeBps).toBe(250);
  });

  it('PATCH updates and writes audit row', async () => {
    const app = buildApp();
    const init: RequestInit = {
      method: 'PATCH',
      body: JSON.stringify({ platformFeeBps: 300 }),
      headers: { 'content-type': 'application/json' },
    };
    const res = await app.fetch(new Request('http://localhost/api/admin/settings', init), env);
    expect(res.status).toBe(200);
    expect((await res.json()).settings.platformFeeBps).toBe(300);
    expect(mockState.auditRows).toHaveLength(1);
    expect(mockState.auditRows[0].action).toBe('platform_settings.update');
  });

  it('PATCH rejects out-of-range fee', async () => {
    const app = buildApp();
    const init: RequestInit = {
      method: 'PATCH',
      body: JSON.stringify({ platformFeeBps: 9999 }),
      headers: { 'content-type': 'application/json' },
    };
    const res = await app.fetch(new Request('http://localhost/api/admin/settings', init), env);
    expect(res.status).toBe(400);
  });
});
