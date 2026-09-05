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
  entries: [] as any[],
  nextCursor: null as string | null,
}));

vi.mock('../../src/modules/admin/audit/repository', () => ({
  listAudit: async (_d1: any, opts: any) => {
    let rows = state.entries;
    if (opts.actorId) rows = rows.filter((r) => r.actorId === opts.actorId);
    if (opts.action) rows = rows.filter((r) => r.action === opts.action);
    if (opts.targetType) rows = rows.filter((r) => r.targetType === opts.targetType);
    if (opts.from) rows = rows.filter((r) => r.createdAt >= opts.from);
    if (opts.to) rows = rows.filter((r) => r.createdAt <= opts.to);
    if (opts.cursor) rows = rows.filter((r) => r.createdAt < Number(opts.cursor));
    return { entries: rows, nextCursor: state.nextCursor };
  },
  purgeExpired: async (_d1: any, _ms: number) => 0,
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

import auditRouter from '../../src/modules/admin/audit/routes';
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
  app.route('/api/admin/audit', auditRouter);
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
  state.entries = [];
  state.nextCursor = null;
}

describe('GET /api/admin/audit', () => {
  beforeEach(reset);

  it('super_admin reads audit entries', async () => {
    state.entries = [
      {
        id: 'a1',
        actorId: 'admin-1',
        actorEmail: 'admin@x.example',
        actorRole: 'super_admin',
        action: 'admin.user.role_change',
        targetType: 'user',
        targetId: 'u-1',
        before: '{"role":"ops"}',
        after: '{"role":"finance"}',
        requestId: 'r1',
        ip: '127.0.0.1',
        createdAt: Date.now(),
      },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].action).toBe('admin.user.role_change');
  });

  it('filters by actorId', async () => {
    state.entries = [
      { id: 'a1', actorId: 'admin-1', action: 'x', targetType: 'user', targetId: 'u-1', createdAt: 1 },
      { id: 'a2', actorId: 'admin-2', action: 'y', targetType: 'user', targetId: 'u-2', createdAt: 2 },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit?actorId=admin-1'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].id).toBe('a1');
  });

  it('filters by action', async () => {
    state.entries = [
      { id: 'a1', actorId: 'admin-1', action: 'admin.invite.create', targetType: 'admin_invite', targetId: 'i1', createdAt: 1 },
      { id: 'a2', actorId: 'admin-1', action: 'admin.user.role_change', targetType: 'user', targetId: 'u-1', createdAt: 2 },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit?action=admin.invite.create'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].action).toBe('admin.invite.create');
  });

  it('filters by date range', async () => {
    state.entries = [
      { id: 'a1', actorId: 'admin-1', action: 'x', targetType: 'user', targetId: 'u-1', createdAt: 100 },
      { id: 'a2', actorId: 'admin-1', action: 'y', targetType: 'user', targetId: 'u-2', createdAt: 200 },
      { id: 'a3', actorId: 'admin-1', action: 'z', targetType: 'user', targetId: 'u-3', createdAt: 300 },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit?from=150&to=250'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].id).toBe('a2');
  });

  it('nextCursor surfaced when present', async () => {
    state.entries = [{ id: 'a1', actorId: 'admin-1', action: 'x', targetType: 'user', targetId: 'u-1', createdAt: 1 }];
    state.nextCursor = '1';
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit'),
      env,
    );
    const body = (await res.json()) as any;
    expect(body.nextCursor).toBe('1');
  });

  it('ops can read (has audit:read) → 200', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/audit'),
      env,
    );
    expect(res.status).toBe(200);
  });

  it('non-admin → 403', async () => {
    const res = await buildApp(null).fetch(
      new Request('http://localhost/api/admin/audit'),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('400 on invalid limit', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit?limit=99999'),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/audit/export', () => {
  beforeEach(reset);

  it('super_admin gets CSV with header + rows', async () => {
    state.entries = [
      {
        id: 'a1',
        actorId: 'admin-1',
        actorEmail: 'admin@x.example',
        actorRole: 'super_admin',
        action: 'admin.invite.create',
        targetType: 'admin_invite',
        targetId: 'i1',
        before: null,
        after: '{"role":"ops"}',
        requestId: 'r1',
        ip: '127.0.0.1',
        createdAt: Date.UTC(2026, 0, 1),
      },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit/export'),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const text = await res.text();
    const lines = text.trim().split('\n');
    expect(lines[0]).toContain('id,actor_id,actor_email,action');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('admin.invite.create');
  });

  it('escapes commas and quotes', async () => {
    state.entries = [
      {
        id: 'a1',
        actorId: 'admin-1',
        actorEmail: 'a,b@c.example',
        actorRole: 'super_admin',
        action: 'x',
        targetType: 'user',
        targetId: 'u-1',
        before: '{"note":"hi, \"there\""}',
        after: null,
        requestId: 'r1',
        ip: null,
        createdAt: Date.UTC(2026, 0, 1),
      },
    ];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/audit/export'),
      env,
    );
    const text = await res.text();
    expect(text).toContain('"a,b@c.example"');
    // value before: {"note":"hi, \"there\""} — wrapped in quotes, internal quotes doubled
    expect(text).toContain('"{""note"":""hi, ""there""""}');
  });

  it('ops blocked → 403 (only super_admin can export)', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/audit/export'),
      env,
    );
    expect(res.status).toBe(403);
  });
});
