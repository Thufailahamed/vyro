import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminSessionIdParam } from '@vyro/validation';
import type { Ctx } from '../../../middleware/session';
import * as svc from './sessionsService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('session:revoke'), async (c) => {
  return c.json(await svc.list(c.env.DB));
});

router.post('/:id/revoke', requirePermission('session:revoke'), async (c) => {
  const param = adminSessionIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const ctx = c.get('ctx') as Ctx;
  return c.json(
    await svc.revoke(c, param.data.id, ctx.userId, 'admin_revoked'),
  );
});

export default router;
