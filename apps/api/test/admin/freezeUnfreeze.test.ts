import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  supplier: null as any,
  audits: [] as any[],
  updated: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({ get: async () => state.supplier }),
      }),
    }),
    insert: (_t: any) => ({
      values: (_v: any) => {
        state.audits.push(_v);
        return { run: async () => undefined };
      },
    }),
  }),
}));

vi.mock(setup.SRC + '/middleware/rbac', () => ({
  requireRole: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'admin-1', isAdmin: true });
    await next();
  },
  requirePermission: () => async (_c: any, next: any) => { await next(); },
}));

vi.mock(setup.SRC + '/middleware/session', () => ({
  session: () => async (_c: any, next: any) => { await next(); },
}));

// Mock suppliers/repository setSupplierStatus so we don't need full update chain
vi.mock(setup.SRC + '/modules/suppliers/repository', () => ({
  findSupplierById: async (_d1: any, id: string) => {
    if (id === 'sup-1') return state.supplier;
    return null;
  },
  setSupplierStatus: async (_d1: any, _id: string, status: string) => {
    state.updated.push({ status });
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

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('POST /api/admin/suppliers/:id/unfreeze', () => {
  beforeEach(() => {
    state.supplier = null;
    state.audits = [];
    state.updated = [];
  });

  it('404 when supplier not found', async () => {
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/suppliers/sup-1/unfreeze', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('200 + audit + status set to active', async () => {
    state.supplier = { id: 'sup-1', status: 'suspended' };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/suppliers/sup-1/unfreeze', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.updated[0]).toEqual({ status: 'active' });
    expect(state.audits[0].action).toBe('supplier.unfreeze');
    expect(state.audits[0].resourceId).toBe('sup-1');
  });
});

describe('POST /api/admin/suppliers/:id/freeze', () => {
  beforeEach(() => {
    state.supplier = null;
    state.audits = [];
    state.updated = [];
  });

  it('sets status to suspended + audit', async () => {
    state.supplier = { id: 'sup-1', status: 'active' };
    const res = await buildApp().fetch(
      new Request('http://localhost/api/admin/suppliers/sup-1/freeze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'spam' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.updated[0]).toEqual({ status: 'suspended' });
    expect(state.audits[0].action).toBe('supplier.freeze');
  });
});
