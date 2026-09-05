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

const state = vi.hoisted(() => ({
  user: null as any,
  superCount: 0,
  nextSetRows: 1,
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/roles/repository', () => ({
  getAdminUser: async (_d1: any, id: string) => {
    if (!state.user) return null;
    return { id, adminRole: state.user.role };
  },
  setAdminRole: async (_d1: any, _id: string, _expected: any, _newRole: any) => state.nextSetRows,
  countSuperAdmins: async (_d1: any) => state.superCount,
  listAdmins: async (_d1: any) => [],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: any) => {
        const run = async () => {
          if (v && typeof v.action === 'string') state.audit.push(v);
        };
        return { run, then: (resolve: any, reject: any) => run().then(resolve, reject) };
      },
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    const role = (c.get('testRole') ?? null) as AdminRole | null;
    const userId = (c.get('testUserId') ?? 'admin-1') as string;
    c.set('ctx', {
      userId,
      email: 'admin@x.example',
      isAdmin: role !== null,
      adminRole: role,
      businesses: [],
      suppliers: [],
    });
    await n();
  },
}));

import usersRouter from '../../src/modules/admin/users';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp(adminRole: AdminRole | null, userId = 'admin-1') {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => {
    c.set('testRole', adminRole);
    c.set('testUserId', userId);
    await next();
  });
  app.route('/api/admin/users', usersRouter);
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
  state.user = null;
  state.superCount = 0;
  state.nextSetRows = 1;
  state.audit = [];
}

describe('PATCH /api/admin/users/:id/role', () => {
  beforeEach(reset);

  it('super_admin changes ops → finance', async () => {
    state.user = { role: 'ops' };
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/users/u-1/role', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'finance' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.role).toBe('finance');
    expect(state.audit.some((a) => a.action === 'admin.user.role_change')).toBe(true);
  });

  it('ops cannot role_change → 403', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/users/u-1/role', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'finance' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('cannot demote self → 409 CANNOT_DEMOTE_SELF', async () => {
    state.user = { role: 'super_admin' };
    const res = await buildApp('super_admin', 'admin-1').fetch(
      new Request('http://localhost/api/admin/users/admin-1/role', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'ops' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CANNOT_DEMOTE_SELF');
  });

  it('cannot demote last super_admin → 409 LAST_SUPER_ADMIN', async () => {
    state.user = { role: 'super_admin' };
    state.superCount = 1;
    const res = await buildApp('super_admin', 'admin-2').fetch(
      new Request('http://localhost/api/admin/users/u-1/role', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'ops' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('LAST_SUPER_ADMIN');
  });

  it('user not found → 404', async () => {
    state.user = null;
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/users/u-x/role', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'finance' }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('concurrent change → 409 ROLE_CHANGED', async () => {
    state.user = { role: 'ops' };
    state.nextSetRows = 0;
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/users/u-1/role', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'finance' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('ROLE_CHANGED');
  });

  it('400 on invalid role', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/users/u-1/role', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'god' }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/users/:id/role', () => {
  beforeEach(reset);

  it('super_admin demotes ops → 204 + audit', async () => {
    state.user = { role: 'ops' };
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/users/u-1/role', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(204);
    expect(state.audit.some((a) => a.action === 'admin.user.role_remove')).toBe(true);
  });

  it('cannot demote self → 409 CANNOT_DEMOTE_SELF', async () => {
    state.user = { role: 'super_admin' };
    const res = await buildApp('super_admin', 'admin-1').fetch(
      new Request('http://localhost/api/admin/users/admin-1/role', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(409);
  });

  it('cannot demote last super_admin → 409 LAST_SUPER_ADMIN', async () => {
    state.user = { role: 'super_admin' };
    state.superCount = 1;
    const res = await buildApp('super_admin', 'admin-2').fetch(
      new Request('http://localhost/api/admin/users/u-1/role', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(409);
  });

  it('ops blocked → 403', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/users/u-1/role', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
