import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: {
    WEB_ORIGIN: 'x',
    ADMIN_ORIGIN: 'x',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'x',
    ENVIRONMENT: 'test',
  },
}));

const state = vi.hoisted(() => ({
  biz: null as any,
  update: null as any,
  audit: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => state.biz,
        }),
      }),
    }),
    update: () => ({
      set: (v: any) => ({
        where: () => ({
          run: async () => {
            state.update = v;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        const run = async () => {
          state.audit.push(v);
        };
        return { run, then: (resolve: any, reject: any) => run().then(resolve, reject) };
      },
    }),
  }),
}));

vi.mock(setup.SRC + '/middleware/requireRole', () => ({
  requireRole: () => async (_c: any, n: any) => {
    await n();
  },
}));
vi.mock(setup.SRC + '/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    c.set('ctx', { userId: 'admin-1', isAdmin: true, businesses: [], suppliers: [] });
    await n();
  },
}));

import adminRouter from '../../src/modules/admin/routes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin', adminRouter);
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

describe('business freeze/unfreeze', () => {
  beforeEach(() => {
    state.biz = null;
    state.update = null;
    state.audit = [];
  });

  it('freezes business', async () => {
    state.biz = { id: 'biz-1', status: 'active' };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/businesses/biz-1/freeze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'policy' }),
      }),
      env
    );
    expect(res.status).toBe(200);
    expect(state.update).toEqual({ status: 'suspended' });
    expect(state.audit[0].action).toBe('business.freeze');
  });

  it('unfreezes business', async () => {
    state.biz = { id: 'biz-1', status: 'suspended' };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/businesses/biz-1/unfreeze', { method: 'POST' }),
      env
    );
    expect(res.status).toBe(200);
    expect(state.update).toEqual({ status: 'active' });
    expect(state.audit[0].action).toBe('business.unfreeze');
  });

  it('404 when business missing', async () => {
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/businesses/x/freeze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'test' }),
      }),
      env
    );
    expect(res.status).toBe(404);
  });
});
