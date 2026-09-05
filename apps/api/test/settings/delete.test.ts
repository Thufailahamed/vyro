import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const state = vi.hoisted(() => ({
  updated: null as any,
  audits: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    update: () => ({
      set: (v: any) => ({
        where: () => ({
          run: async () => {
            state.updated = v;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => ({
        run: async () => {
          state.audits.push(v);
        },
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

import deleteRouter from '../../src/modules/settings/delete';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/settings', deleteRouter);
  return app;
}

describe('POST /api/settings/me/delete', () => {
  beforeEach(() => {
    state.updated = null;
    state.audits = [];
  });

  const call = (body: any) =>
    new Request('http://localhost/api/settings/me/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('400 if body missing', async () => {
    const res = await buildApp().fetch(call({}), {} as any);
    expect(res.status).toBe(400);
  });

  it('400 if confirm wrong', async () => {
    const res = await buildApp().fetch(call({ confirm: 'yes' }), {} as any);
    expect(res.status).toBe(400);
  });

  it('202 + schedules delete + writes audit', async () => {
    const res = await buildApp().fetch(call({ confirm: 'DELETE' }), {} as any);
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.scheduledAt).toBeGreaterThan(Date.now());
    expect(state.updated.status).toBe('pending_deletion');
    expect(state.updated.deletionScheduledFor).toBeGreaterThan(Date.now());
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].action).toBe('account.delete.scheduled');
  });
});
