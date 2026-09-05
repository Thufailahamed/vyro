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
  handlerInvoked: 0,
  failNext: false,
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/observability/cronRegistry', () => ({
  CRON_JOBS: [
    { name: 'daily-purge', schedule: '0 3 * * *', description: 'purge', handler: async () => { state.handlerInvoked++; if (state.failNext) throw new Error('boom'); } },
    { name: 'webhook-retry', schedule: '*/15 * * * *', description: 'retry', handler: async () => undefined },
  ],
  getCronJob: (name: string) => {
    if (name === 'daily-purge') {
      return {
        name: 'daily-purge',
        schedule: '0 3 * * *',
        description: 'purge',
        handler: async () => {
          state.handlerInvoked++;
          if (state.failNext) throw new Error('boom');
        },
      };
    }
    return undefined;
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import cronRouter from '../../src/modules/admin/observability/cronRoutes';
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
  app.route('/api/admin/cron', cronRouter);
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
  state.handlerInvoked = 0;
  state.failNext = false;
  state.audit = [];
}

describe('cron', () => {
  beforeEach(reset);

  it('GET → super_admin 200 lists jobs', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/cron', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.jobs.length).toBe(2);
    expect(body.jobs[0].name).toBe('daily-purge');
  });

  it('GET → ops 200', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/cron', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it('GET → support 403', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/cron', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('POST /trigger → super_admin 200 + audit + handler ran', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/cron/trigger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'daily-purge' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.handlerInvoked).toBe(1);
    expect(state.audit[0].action).toBe('cron.trigger');
  });

  it('POST /trigger → ops 403', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/cron/trigger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'daily-purge' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('POST /trigger → unknown job 404', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/cron/trigger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'no-such-job' }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('POST /trigger → handler throws 500', async () => {
    state.failNext = true;
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/cron/trigger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'daily-purge' }),
      }),
      env,
    );
    expect(res.status).toBe(500);
  });
});
