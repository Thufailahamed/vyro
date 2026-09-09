import { Hono } from 'hono';
import { session } from '../../../middleware/session';
import { requireRole, requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { isAdminRole } from '@vyro/auth';
import { bulkIdsBody, bulkUsersRoleBody } from './schema';
import { bulkAction, type AdminContext } from './executor';
import * as usersSuspend from './actions/usersSuspend';
import * as usersUnsuspend from './actions/usersUnsuspend';
import * as usersRole from './actions/usersRole';
import * as businessesSuspend from './actions/businessesSuspend';
import * as businessesUnsuspend from './actions/businessesUnsuspend';
import type { Env } from '../../../env';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));

function ctx(c: any): AdminContext {
  const v = c.get('ctx') as { adminRole?: string; userId?: string };
  if (!isAdminRole(v.adminRole) || !v.userId) throw httpError(401, 'UNAUTHORIZED', 'admin session');
  return { role: v.adminRole, userId: v.userId };
}

router.post('/users/suspend', requirePermission('user:suspend'), async (c) => {
  const body = bulkIdsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'users', action: 'suspend',
    ids: body.data.ids,
    perItem: (id) => usersSuspend.run(env, id),
  });
  return c.json(result);
});

router.post('/users/unsuspend', requirePermission('user:suspend'), async (c) => {
  const body = bulkIdsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'users', action: 'unsuspend',
    ids: body.data.ids,
    perItem: (id) => usersUnsuspend.run(env, id),
  });
  return c.json(result);
});

router.post('/users/role', requirePermission('admin:role_change'), async (c) => {
  const body = bulkUsersRoleBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'users', action: 'role',
    ids: body.data.ids,
    extras: { role: body.data.role },
    perItem: (id) => usersRole.run(env, id, body.data.role),
  });
  return c.json(result);
});

router.post('/businesses/suspend', requirePermission('user:suspend'), async (c) => {
  const body = bulkIdsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'businesses', action: 'suspend',
    ids: body.data.ids,
    perItem: (id) => businessesSuspend.run(env, id),
  });
  return c.json(result);
});

router.post('/businesses/unsuspend', requirePermission('user:suspend'), async (c) => {
  const body = bulkIdsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'businesses', action: 'unsuspend',
    ids: body.data.ids,
    perItem: (id) => businessesUnsuspend.run(env, id),
  });
  return c.json(result);
});

export default router;
