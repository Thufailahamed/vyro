import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { adminUsersListQuery, adminUserIdParam } from '@vyro/validation/adminUsers';
import { listAdminUsers, setUserStatus } from './usersRepository';

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

router.post('/:id/suspend', requireRole({ admin: true }), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  await setUserStatus(c.env.DB, ctx.userId, paramParsed.data.id, 'suspended');
  return c.json({ ok: true });
});

router.post('/:id/unsuspend', requireRole({ admin: true }), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  await setUserStatus(c.env.DB, ctx.userId, paramParsed.data.id, 'active');
  return c.json({ ok: true });
});

export default router;
