import { Hono } from 'hono';
import { session } from '../../../middleware/session';
import { requireRole, requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import { adminNotificationQuery, adminNotificationBroadcast } from './schema';
import {
  listNotifications, getUnreadCount, dismissOne, dismissAll, broadcast,
} from './service';
import { isAdminRole } from '@vyro/auth';
import type { AdminRole } from '@vyro/auth';
import type { Env } from '../../../env';

type Ctx = { userId?: string; adminRole?: string; isAdmin?: boolean };

export const adminNotificationsRoutes = new Hono();
adminNotificationsRoutes.use('*', session(), requireRole({ admin: true }));

function ctx(c: any): { role: AdminRole; userId: string } {
  const ctx = c.get('ctx') as Ctx;
  const role = ctx.adminRole;
  const userId = ctx.userId;
  if (!isAdminRole(role) || !userId) throw httpError(401, 'UNAUTHORIZED', 'admin session required');
  return { role, userId };
}

adminNotificationsRoutes.get('/', requirePermission('notification:read'), async (c) => {
  const admin = ctx(c);
  const url = new URL(c.req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = adminNotificationQuery.safeParse(params);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', parsed.error.message);
  const out = await listNotifications(c.env as unknown as Env, admin, params);
  return c.json(out);
});

adminNotificationsRoutes.get('/unread-count', requirePermission('notification:read'), async (c) => {
  const admin = ctx(c);
  const count = await getUnreadCount(c.env as unknown as Env, admin);
  c.header('Cache-Control', 'private, max-age=30');
  return c.json({ count });
});

adminNotificationsRoutes.post('/:id/read', requirePermission('notification:dismiss'), async (c) => {
  const id = c.req.param('id');
  if (!id) throw httpError(400, 'VALIDATION_ERROR', 'id required');
  const admin = ctx(c);
  const ok = await dismissOne(c.env as unknown as Env, admin, id);
  if (!ok) throw httpError(404, 'NOT_FOUND', 'notification not in your inbox');
  await auditAdmin({ ctx: c, action: 'notification.dismiss', target: { type: 'admin_notification', id } });
  return c.json({ ok: true });
});

adminNotificationsRoutes.post('/read-all', requirePermission('notification:dismiss'), async (c) => {
  const admin = ctx(c);
  const out = await dismissAll(c.env as unknown as Env, admin);
  await auditAdmin({ ctx: c, action: 'notification.dismiss_all', target: { type: 'admin_notification', id: 'all' } });
  return c.json(out);
});

adminNotificationsRoutes.post('/', requirePermission('notification:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = adminNotificationBroadcast.safeParse(body);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', parsed.error.message);
  const admin = ctx(c);
  const out = await broadcast(c.env as unknown as Env, {
    role: parsed.data.role,
    severity: parsed.data.severity,
    category: 'admin_alert',
    title: parsed.data.title,
    body: parsed.data.body,
    ...(parsed.data.link ? { link: parsed.data.link } : {}),
    ...(parsed.data.sourceRef ? { sourceRef: parsed.data.sourceRef } : {}),
    actorUserId: admin.userId,
  });
  await auditAdmin({ ctx: c, action: 'notification.broadcast', target: { type: 'admin_notification', id: parsed.data.sourceRef ?? 'ad-hoc' } });
  return c.json(out);
});

export default adminNotificationsRoutes;
