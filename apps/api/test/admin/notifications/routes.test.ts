import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminNotificationsRoutes from '../../../src/modules/admin/notifications/routes';

const state = vi.hoisted(() => ({
  ctx: { isAdmin: true, adminRole: 'finance', userId: 'u-1' } as any,
  list: { notifications: [], nextCursor: null, unreadCount: 0 },
  count: 0,
  readOk: true,
  allRead: { updated: 3 },
  broadcast: { recipients: 2 },
}));

vi.mock('../../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => { c.set('ctx', state.ctx); await next(); },
}));
vi.mock('../../../src/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => await next(),
  requirePermission: (_p: any) => async (_c: any, next: any) => await next(),
}));
vi.mock('../../../src/modules/admin/lib/audit', () => ({ auditAdmin: async () => {} }));
vi.mock('../../../src/modules/admin/notifications/service', () => ({
  listNotifications: async () => state.list,
  getUnreadCount: async () => state.count,
  dismissOne: async () => state.readOk,
  dismissAll: async () => state.allRead,
  broadcast: async () => state.broadcast,
}));

function app() {
  const a = new Hono();
  a.onError((err, c) => {
    const e = err as { code?: string; status?: number; message?: string };
    const status = e.status ?? 500;
    return c.json({ code: e.code ?? 'INTERNAL', message: e.message ?? 'internal error' }, status as any);
  });
  a.route('/admin/notifications', adminNotificationsRoutes);
  return a;
}

describe('admin notifications routes', () => {
  it('GET / returns inbox + unreadCount', async () => {
    const res = await app().request('/admin/notifications');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.unreadCount).toBe(0);
  });

  it('GET /unread-count returns number with cache header', async () => {
    state.count = 5;
    const res = await app().request('/admin/notifications/unread-count');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=30');
    expect((await res.json() as any).count).toBe(5);
  });

  it('POST /:id/read 404 when not in inbox', async () => {
    state.readOk = false;
    const res = await app().request('/admin/notifications/n-1/read', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('POST /read-all returns updated count', async () => {
    state.allRead = { updated: 7 };
    const res = await app().request('/admin/notifications/read-all', { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json() as any).updated).toBe(7);
  });

  it('POST / broadcast returns recipients', async () => {
    state.broadcast = { recipients: 4 };
    const res = await app().request('/admin/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'ops', severity: 'warning', title: 't', body: 'b' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any).recipients).toBe(4);
  });
});
