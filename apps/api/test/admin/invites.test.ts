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
  invites: [] as any[],
  inviteByToken: null as any,
  existingUser: null as any,
  insertedUsers: [] as any[],
  updatedUsers: [] as any[],
  markedAccepted: [] as string[],
  audit: [] as any[],
  nextRevokeOk: true,
}));

vi.mock('../../src/modules/admin/invites/repository', () => ({
  createInvite: async (_d1: any, opts: any) => {
    const id = `inv-${state.invites.length + 1}`;
    state.invites.push({ id, ...opts });
    return { id, expiresAt: opts.expiresAt };
  },
  findByTokenHash: async (_d1: any, _hash: string) => state.inviteByToken,
  markAccepted: async (_d1: any, inviteId: string, _userId: string) => {
    state.markedAccepted.push(inviteId);
  },
  revoke: async (_d1: any, id: string) => {
    if (!state.nextRevokeOk) return;
    state.invites = state.invites.map((r) => (r.id === id ? { ...r, revokedAt: Date.now() } : r));
  },
  listInvites: async (_d1: any, _status?: string) => state.invites,
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.existingUser,
        }),
      }),
    }),
    update: () => ({
      set: (v: any) => ({
        where: (_c: any) => ({
          run: async () => {
            state.updatedUsers.push(v);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        const run = async () => {
          if (v && typeof v.action === 'string') state.audit.push(v);
          else if (v && v.email) state.insertedUsers.push(v);
        };
        return { run, then: (resolve: any, reject: any) => run().then(resolve, reject) };
      },
    }),
  }),
}));

import invitesRouter from '../../src/modules/admin/invites/routes';
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
  app.route('/api/admin/invites', invitesRouter);
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
  state.invites = [];
  state.inviteByToken = null;
  state.existingUser = null;
  state.insertedUsers = [];
  state.updatedUsers = [];
  state.markedAccepted = [];
  state.audit = [];
  state.nextRevokeOk = true;
}

describe('POST /api/admin/invites', () => {
  beforeEach(reset);

  it('super_admin invites ops → 201 + invite row + audit', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@x.example', role: 'ops' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.id).toBeTruthy();
    expect(body.acceptUrl).toMatch(/^\/admin\/invite\/accept\?token=/);
    expect(state.invites.length).toBe(1);
    expect(state.invites[0].role).toBe('ops');
    expect(state.audit.some((a) => a.action === 'admin.invite.create')).toBe(true);
  });

  it('ops cannot invite super_admin → 422 ROLE_NOT_GRANTABLE', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@x.example', role: 'super_admin' }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('ROLE_NOT_GRANTABLE');
  });

  it('finance cannot invite anyone → 403 from requirePermission', async () => {
    const res = await buildApp('finance').fetch(
      new Request('http://localhost/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@x.example', role: 'ops' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('non-admin role cannot invite → 403', async () => {
    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@x.example', role: 'ops' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('existing user with different role → 409 ROLE_CONFLICT', async () => {
    state.existingUser = { id: 'u-1', adminRole: 'ops', status: 'active' };
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'u1@x.example', role: 'finance' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('ROLE_CONFLICT');
  });

  it('suspended existing user → 409 USER_SUSPENDED', async () => {
    state.existingUser = { id: 'u-1', adminRole: null, status: 'suspended' };
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'u1@x.example', role: 'ops' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('USER_SUSPENDED');
  });

  it('400 on invalid email', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', role: 'ops' }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/invites', () => {
  beforeEach(reset);

  it('super_admin lists invites', async () => {
    state.invites = [
      { id: 'i1', email: 'a@x.example', role: 'ops', expiresAt: Date.now() + 1000 },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/invites'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.invites.length).toBe(1);
  });

  it('support blocked from listing → 403', async () => {
    const res = await buildApp('support').fetch(
      new Request('http://localhost/api/admin/invites'),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/invites/:id', () => {
  beforeEach(reset);

  it('super_admin revokes pending → 204 + audit', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    state.invites = [
      { id, email: 'a@x.example', role: 'ops', expiresAt: Date.now() + 1000, revokedAt: null, acceptedAt: null },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request(`http://localhost/api/admin/invites/${id}`, { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(204);
    expect(state.audit.some((a) => a.action === 'admin.invite.revoke')).toBe(true);
  });

  it('400 on bad id format', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/invites/not-a-uuid', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/invites/accept', () => {
  beforeEach(reset);

  it('accept valid token + new user → creates user + marks accepted', async () => {
    const token = 'a'.repeat(48);
    state.inviteByToken = {
      id: 'i1',
      email: 'newbie@x.example',
      role: 'ops',
      invitedBy: 'admin-1',
      expiresAt: Date.now() + 100_000,
      acceptedAt: null,
      revokedAt: null,
    };
    state.existingUser = null;

    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name: 'Newbie', password: 'correct-horse-battery' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.role).toBe('ops');
    expect(body.email).toBe('newbie@x.example');
    expect(state.insertedUsers.length).toBe(1);
    expect(state.insertedUsers[0].adminRole).toBe('ops');
  });

  it('accept with invalid token → 404', async () => {
    state.inviteByToken = null;
    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'x'.repeat(48) }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('accept expired invite → 410 INVITE_EXPIRED', async () => {
    state.inviteByToken = {
      id: 'i2',
      email: 'e@x.example',
      role: 'ops',
      invitedBy: 'admin-1',
      expiresAt: Date.now() - 1000,
      acceptedAt: null,
      revokedAt: null,
    };
    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'b'.repeat(48) }),
      }),
      env,
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('INVITE_EXPIRED');
  });

  it('accept revoked invite → 410 INVITE_REVOKED', async () => {
    state.inviteByToken = {
      id: 'i3',
      email: 'r@x.example',
      role: 'ops',
      invitedBy: 'admin-1',
      expiresAt: Date.now() + 100_000,
      acceptedAt: null,
      revokedAt: Date.now() - 1000,
    };
    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'c'.repeat(48) }),
      }),
      env,
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('INVITE_REVOKED');
  });

  it('accept already-accepted invite → 409 INVITE_ACCEPTED', async () => {
    state.inviteByToken = {
      id: 'i4',
      email: 'a2@x.example',
      role: 'ops',
      invitedBy: 'admin-1',
      expiresAt: Date.now() + 100_000,
      acceptedAt: Date.now() - 1000,
      revokedAt: null,
    };
    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'd'.repeat(48) }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('INVITE_ACCEPTED');
  });
});
