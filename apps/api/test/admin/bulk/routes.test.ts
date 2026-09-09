import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminBulkRoutes from '../../../src/modules/admin/bulk/routes';

const state = vi.hoisted(() => ({
  ctx: { isAdmin: true, adminRole: 'super_admin', userId: 'u-1' } as any,
  lastCall: null as null | { path: string; ids: any; extras?: any },
}));

vi.mock('../../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => { c.set('ctx', state.ctx); await next(); },
}));
vi.mock('../../../src/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => await next(),
  requirePermission: () => async (_c: any, next: any) => await next(),
}));
vi.mock('../../../src/modules/admin/lib/audit', () => ({ auditAdminFromDb: async () => {} }));
vi.mock('../../../src/modules/admin/bulk/executor', () => ({
  bulkAction: async (opts: any) => {
    state.lastCall = { path: `${opts.entity}/${opts.action}`, ids: opts.ids, extras: opts.extras };
    return { batchId: 'b1', total: opts.ids.length, succeeded: opts.ids, failed: [] };
  },
}));
vi.mock('../../../src/modules/admin/bulk/actions/usersSuspend', () => ({ run: async () => 'ok' }));
vi.mock('../../../src/modules/admin/bulk/actions/usersUnsuspend', () => ({ run: async () => 'ok' }));
vi.mock('../../../src/modules/admin/bulk/actions/usersRole', () => ({ run: async () => 'ok' }));
vi.mock('../../../src/modules/admin/bulk/actions/businessesSuspend', () => ({ run: async () => 'ok' }));
vi.mock('../../../src/modules/admin/bulk/actions/businessesUnsuspend', () => ({ run: async () => 'ok' }));

function app() {
  const a = new Hono();
  a.onError((err, c) => c.json({ message: (err as Error).message }, 500));
  a.route('/admin/bulk', adminBulkRoutes);
  return a;
}

const post = (path: string, body: any) =>
  app().request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('bulk routes happy path', () => {
  it('users/suspend', async () => {
    const r = await post('/admin/bulk/users/suspend', { ids: ['a', 'b'] });
    expect(r.status).toBe(200);
    expect((await r.json() as any).total).toBe(2);
    expect(state.lastCall?.path).toBe('users/suspend');
  });

  it('users/unsuspend', async () => {
    const r = await post('/admin/bulk/users/unsuspend', { ids: ['a'] });
    expect(r.status).toBe(200);
    expect(state.lastCall?.path).toBe('users/unsuspend');
  });

  it('users/role', async () => {
    const r = await post('/admin/bulk/users/role', { ids: ['a'], role: 'ops' });
    expect(r.status).toBe(200);
    expect(state.lastCall?.path).toBe('users/role');
    expect(state.lastCall?.extras).toMatchObject({ role: 'ops' });
  });

  it('businesses/suspend', async () => {
    const r = await post('/admin/bulk/businesses/suspend', { ids: ['x'] });
    expect(r.status).toBe(200);
    expect(state.lastCall?.path).toBe('businesses/suspend');
  });

  it('businesses/unsuspend', async () => {
    const r = await post('/admin/bulk/businesses/unsuspend', { ids: ['x'] });
    expect(r.status).toBe(200);
    expect(state.lastCall?.path).toBe('businesses/unsuspend');
  });

  it('rejects 101 IDs with 500 (validation error)', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `u${i}`);
    const r = await post('/admin/bulk/users/suspend', { ids });
    expect(r.status).toBe(500);
  });

  it('rejects empty ids with 500', async () => {
    const r = await post('/admin/bulk/users/suspend', { ids: [] });
    expect(r.status).toBe(500);
  });
});
