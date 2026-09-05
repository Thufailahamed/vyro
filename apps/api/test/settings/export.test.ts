import { describe, it, expect, vi } from 'vitest';
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

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          all: async () => [],
        }),
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: false });
    await n();
  },
}));

import exportRouter from '../../src/modules/settings/export';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/settings', exportRouter);
  return app;
}

describe('GET /api/settings/me/export', () => {
  it('returns 200 with exportedAt timestamp', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/settings/me/export'), {} as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.exportedAt).toBe('string');
    expect(new Date(body.exportedAt).getTime()).toBeGreaterThan(0);
  });
});
