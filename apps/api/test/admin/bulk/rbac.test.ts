import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

const state = vi.hoisted(() => ({
  ctx: { isAdmin: true, adminRole: 'super_admin', userId: 'u-1' } as any,
  permissions: new Set<string>(),
}));

function makeMocks() {
  vi.doMock('../../../src/middleware/session', () => ({
    session: () => async (c: any, next: any) => { c.set('ctx', state.ctx); await next(); },
  }));
  vi.doMock('../../../src/middleware/rbac', () => ({
    requireRole: () => async (_c: any, next: any) => await next(),
    requirePermission: (perm: string) => async (_c: any, next: any) => {
      if (!state.permissions.has(perm)) throw new Error('FORBIDDEN');
      await next();
    },
  }));
  vi.doMock('../../../src/modules/admin/lib/audit', () => ({ auditAdminFromDb: async () => {} }));
  vi.doMock('../../../src/modules/admin/bulk/executor', () => ({
    bulkAction: async () => ({ batchId: 'b', total: 0, succeeded: [], failed: [] }),
  }));
  vi.doMock('../../../src/modules/admin/bulk/actions/usersSuspend', () => ({ run: async () => 'ok' }));
  vi.doMock('../../../src/modules/admin/bulk/actions/usersUnsuspend', () => ({ run: async () => 'ok' }));
  vi.doMock('../../../src/modules/admin/bulk/actions/usersRole', () => ({ run: async () => 'ok' }));
  vi.doMock('../../../src/modules/admin/bulk/actions/businessesSuspend', () => ({ run: async () => 'ok' }));
  vi.doMock('../../../src/modules/admin/bulk/actions/businessesUnsuspend', () => ({ run: async () => 'ok' }));
}

async function loadFreshApp() {
  vi.resetModules();
  makeMocks();
  const mod = await import('../../../src/modules/admin/bulk/routes');
  const a = new Hono();
  a.onError((err, c) => c.json({ message: (err as Error).message }, 500));
  a.route('/admin/bulk', mod.default);
  return a;
}

const post = (app: Hono, path: string, body: any) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('bulk routes RBAC', () => {
  it('user:suspend grants users + businesses suspend/unsuspend', async () => {
    state.permissions = new Set(['user:suspend']);
    const a = await loadFreshApp();
    expect((await post(a, '/admin/bulk/users/suspend', { ids: ['a'] })).status).toBe(200);
    expect((await post(a, '/admin/bulk/users/unsuspend', { ids: ['a'] })).status).toBe(200);
    expect((await post(a, '/admin/bulk/businesses/suspend', { ids: ['a'] })).status).toBe(200);
    expect((await post(a, '/admin/bulk/businesses/unsuspend', { ids: ['a'] })).status).toBe(200);
  });

  it('admin:role_change grants users/role', async () => {
    state.permissions = new Set(['admin:role_change']);
    const a = await loadFreshApp();
    expect((await post(a, '/admin/bulk/users/role', { ids: ['a'], role: 'ops' })).status).toBe(200);
  });

  it('missing permission rejects with 500', async () => {
    state.permissions = new Set();
    const a = await loadFreshApp();
    expect((await post(a, '/admin/bulk/users/suspend', { ids: ['a'] })).status).toBe(500);
    expect((await post(a, '/admin/bulk/users/unsuspend', { ids: ['a'] })).status).toBe(500);
    expect((await post(a, '/admin/bulk/users/role', { ids: ['a'], role: 'ops' })).status).toBe(500);
    expect((await post(a, '/admin/bulk/businesses/suspend', { ids: ['a'] })).status).toBe(500);
    expect((await post(a, '/admin/bulk/businesses/unsuspend', { ids: ['a'] })).status).toBe(500);
  });

  it('user:suspend without admin:role_change rejects users/role', async () => {
    state.permissions = new Set(['user:suspend']);
    const a = await loadFreshApp();
    expect((await post(a, '/admin/bulk/users/role', { ids: ['a'], role: 'ops' })).status).toBe(500);
  });
});
