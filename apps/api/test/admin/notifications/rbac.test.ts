import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminNotificationsRoutes from '../../../src/modules/admin/notifications/routes';

const state = vi.hoisted(() => ({
  ctx: { isAdmin: true, adminRole: 'finance', userId: 'u-1' } as any,
  serviceCalls: [] as string[],
}));

function makeMocks(opts: { allowRead?: boolean; allowDismiss?: boolean; allowWrite?: boolean }) {
  vi.doMock('../../../src/middleware/session', () => ({
    session: () => async (c: any, next: any) => { c.set('ctx', state.ctx); await next(); },
  }));
  vi.doMock('../../../src/middleware/rbac', () => ({
    requireRole: () => async (_c: any, next: any) => await next(),
    requirePermission: (perm: string) => async (_c: any, next: any) => {
      if (perm === 'notification:read' && !opts.allowRead) throw new Error('FORBIDDEN');
      if (perm === 'notification:dismiss' && !opts.allowDismiss) throw new Error('FORBIDDEN');
      if (perm === 'notification:write' && !opts.allowWrite) throw new Error('FORBIDDEN');
      await next();
    },
  }));
  vi.doMock('../../../src/modules/admin/lib/audit', () => ({ auditAdmin: async () => {} }));
  vi.doMock('../../../src/modules/admin/notifications/service', () => ({
    listNotifications: async () => { state.serviceCalls.push('list'); return { notifications: [], nextCursor: null, unreadCount: 0 }; },
    getUnreadCount: async () => { state.serviceCalls.push('count'); return 0; },
    dismissOne: async () => { state.serviceCalls.push('dismiss'); return true; },
    dismissAll: async () => { state.serviceCalls.push('dismissAll'); return { updated: 0 }; },
    broadcast: async () => { state.serviceCalls.push('broadcast'); return { recipients: 0 }; },
  }));
}

function buildApp() {
  const a = new Hono();
  a.onError((err, c) => c.json({ code: 'E', message: (err as Error).message }, 500));
  a.route('/admin/notifications', adminNotificationsRoutes);
  return a;
}

describe('admin notifications RBAC', () => {
  it('read allowed: GET / and /unread-count pass', async () => {
    vi.resetModules();
    makeMocks({ allowRead: true, allowDismiss: false, allowWrite: false });
    const { default: fresh } = await import('../../../src/modules/admin/notifications/routes');
    const a = new Hono();
    a.onError((err, c) => c.json({ message: (err as Error).message }, 500));
    a.route('/admin/notifications', fresh);
    const r1 = await a.request('/admin/notifications');
    const r2 = await a.request('/admin/notifications/unread-count');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('read denied: GET / fails with 500', async () => {
    vi.resetModules();
    makeMocks({ allowRead: false, allowDismiss: true, allowWrite: true });
    const { default: fresh } = await import('../../../src/modules/admin/notifications/routes');
    const a = new Hono();
    a.onError((err, c) => c.json({ message: (err as Error).message }, 500));
    a.route('/admin/notifications', fresh);
    const r = await a.request('/admin/notifications');
    expect(r.status).toBe(500);
  });

  it('dismiss denied: POST /:id/read fails', async () => {
    vi.resetModules();
    makeMocks({ allowRead: true, allowDismiss: false, allowWrite: true });
    const { default: fresh } = await import('../../../src/modules/admin/notifications/routes');
    const a = new Hono();
    a.onError((err, c) => c.json({ message: (err as Error).message }, 500));
    a.route('/admin/notifications', fresh);
    const r = await a.request('/admin/notifications/n-1/read', { method: 'POST' });
    expect(r.status).toBe(500);
  });

  it('write denied: POST / broadcast fails', async () => {
    vi.resetModules();
    makeMocks({ allowRead: true, allowDismiss: true, allowWrite: false });
    const { default: fresh } = await import('../../../src/modules/admin/notifications/routes');
    const a = new Hono();
    a.onError((err, c) => c.json({ message: (err as Error).message }, 500));
    a.route('/admin/notifications', fresh);
    const r = await a.request('/admin/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'ops', severity: 'info', title: 't', body: 'b' }),
    });
    expect(r.status).toBe(500);
  });
});
