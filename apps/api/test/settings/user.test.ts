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

const userSettingsStore = new Map<string, any>();

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: any) => ({
        where: (cond: any) => ({
          get: async () => {
            if (table?.name === 'user_settings') {
              const id = typeof cond === 'object' ? cond.left?.userId ?? cond.params?.[0] : undefined;
              return userSettingsStore.get(id) ?? null;
            }
            return null;
          },
        }),
      }),
    }),
    insert: (table: any) => ({
      values: (vals: any) => ({
        onConflictDoUpdate: (_opts: any) => ({
          run: async () => {
            if (table?.name === 'user_settings') {
              userSettingsStore.set(vals.userId, vals);
              return {};
            }
            return {};
          },
        }),
        run: async () => {
          if (table?.name === 'user_settings') {
            userSettingsStore.set(vals.userId, vals);
            return {};
          }
          return {};
        },
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: false });
    await next();
  },
}));

import settingsRouter from '../../src/modules/settings/routes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/settings', settingsRouter);
  return app;
}

describe('settings user routes', () => {
  beforeEach(() => userSettingsStore.clear());

  const env = {
    DB: {} as any,
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  } as any;

  const call = (method: string, path: string, body?: any) => {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { 'content-type': 'application/json' };
    }
    return new Request('http://localhost' + path, init);
  };

  it('GET /me lazy-creates defaults on first read', async () => {
    const app = buildApp();
    const res = await app.fetch(call('GET', '/api/settings/me'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.settings.userId).toBe('u-1');
    expect(body.settings.preferredCurrency).toBe('LKR');
    expect(body.settings.notifyOrderUpdates).toBe(1);
  });

  it('PATCH /me rejects extra keys (mass-assignment)', async () => {
    const app = buildApp();
    const res = await app.fetch(call('PATCH', '/api/settings/me', { displayName: 'X', isAdmin: true }), env);
    expect(res.status).toBe(400);
  });

  it('PATCH /me/notifications persists booleans', async () => {
    const app = buildApp();
    const res = await app.fetch(
      call('PATCH', '/api/settings/me/notifications', { notifyMarketing: true }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.notifyMarketing).toBe(true);
  });

  it('PATCH /me/security clamps sessionTimeoutMin', async () => {
    const app = buildApp();
    const res = await app.fetch(
      call('PATCH', '/api/settings/me/security', { sessionTimeoutMin: 45 }),
      env,
    );
    expect(res.status).toBe(400);
  });
});
