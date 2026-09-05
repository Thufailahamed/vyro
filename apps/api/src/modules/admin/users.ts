import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requirePermission, requireRole } from '../../middleware/rbac';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { adminUsersListQuery, adminUserIdParam } from '@vyro/validation/adminUsers';
import { adminRoleChange } from './roles/schema';
import { listAdminUsers, setUserStatus } from './usersRepository';
import { changeRole, demote } from './roles/service';
import { getAdminUser } from './roles/repository';
import { auditAdmin } from './lib/audit';
import { isAdminRole, type AdminRole } from '@vyro/auth';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requireRole({ admin: true }), async (c) => {
  const parsed = adminUsersListQuery.safeParse(c.req.query());
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const out = await listAdminUsers(c.env.DB, {
    cursor: parsed.data.cursor,
    q: parsed.data.q,
  });
  return c.json(out);
});

router.post('/:id/suspend', requirePermission('user:suspend'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  await setUserStatus(c.env.DB, ctx.userId, paramParsed.data.id, 'suspended');
  await auditAdmin({
    ctx: c,
    action: 'user.suspend',
    target: { type: 'user', id: paramParsed.data.id },
    after: { status: 'suspended' },
  });
  return c.json({ ok: true });
});

router.post('/:id/unsuspend', requirePermission('user:unsuspend'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  await setUserStatus(c.env.DB, ctx.userId, paramParsed.data.id, 'active');
  await auditAdmin({
    ctx: c,
    action: 'user.unsuspend',
    target: { type: 'user', id: paramParsed.data.id },
    after: { status: 'active' },
  });
  return c.json({ ok: true });
});

router.patch('/:id/role', requirePermission('admin:role_change'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const bodyParsed = adminRoleChange.safeParse(await c.req.json());
  if (!bodyParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  if (!isAdminRole(bodyParsed.data.role)) throw httpError(400, 'VALIDATION_ERROR', 'Invalid role');
  const before = await getAdminUser(c.env.DB, paramParsed.data.id);
  const out = await changeRole(c.env.DB, {
    actorId: ctx.userId,
    targetId: paramParsed.data.id,
    newRole: bodyParsed.data.role as AdminRole,
  });
  await auditAdmin({
    ctx: c,
    action: 'admin.user.role_change',
    target: { type: 'user', id: paramParsed.data.id },
    before: { role: before?.adminRole ?? null },
    after: { role: bodyParsed.data.role },
  });
  return c.json(out);
});

router.delete('/:id/role', requirePermission('admin:role_change'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const before = await getAdminUser(c.env.DB, paramParsed.data.id);
  await demote(c.env.DB, { actorId: ctx.userId, targetId: paramParsed.data.id });
  await auditAdmin({
    ctx: c,
    action: 'admin.user.role_remove',
    target: { type: 'user', id: paramParsed.data.id },
    before: { role: before?.adminRole ?? null },
    after: { role: null },
  });
  return c.body(null, 204);
});

export default router;
