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
  section: null as null | { section: string; valueJson: string; version: number; updatedBy: string | null; updatedAt: number },
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/platform/configSectionsRepository', () => ({
  getSection: async (_d1: any, section: string) => {
    if (state.section && state.section.section === section) return state.section;
    return null;
  },
  upsertSection: async (_d1: any, section: string, valueJson: string, expectedVersion: number, updatedBy: string) => {
    if (state.section && state.section.section === section && state.section.version !== expectedVersion) {
      return { conflict: true };
    }
    const next = state.section && state.section.section === section
      ? { ...state.section, valueJson, version: state.section.version + 1, updatedBy, updatedAt: Date.now() }
      : { section, valueJson, version: 0, updatedBy, updatedAt: Date.now() };
    state.section = next;
    return { section: next.section, version: next.version, valueJson: next.valueJson };
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import ffRouter from '../../src/modules/admin/platform/featureFlagsRoutes';
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
  app.route('/api/admin/feature-flags', ffRouter);
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
  state.section = null;
  state.audit = [];
}

describe('feature flags', () => {
  beforeEach(reset);

  it('GET → super_admin 200 with defaults', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/feature-flags', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.version).toBe(0);
  });

  it('PUT → super_admin 200 + audit + version bump', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/feature-flags', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: { new_checkout: { enabled: true } }, expectedVersion: 0 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.audit[0].action).toBe('feature_flag.update');
  });

  it('PUT with stale version → 409 STALE_WRITE', async () => {
    state.section = { section: 'feature_flags', valueJson: '{}', version: 5, updatedBy: 'a', updatedAt: 0 };
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/feature-flags', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: {}, expectedVersion: 3 }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('STALE_WRITE');
  });

  it('GET → ops 403', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/feature-flags', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
