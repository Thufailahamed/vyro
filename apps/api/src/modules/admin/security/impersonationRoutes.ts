import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminImpersonateBody } from '@vyro/validation';
import type { Ctx } from '../../../middleware/session';
import * as svc from './impersonationService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('impersonation:start'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const active = await svc.current(c.env.DB, ctx.userId);
  return c.json({ active });
});

router.post('/', requirePermission('impersonation:start'), async (c) => {
  const body = adminImpersonateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  const ctx = c.get('ctx') as Ctx;
  return c.json(await svc.start(c, ctx.userId, body.data.targetUserId, body.data.reason), 201);
});

router.post('/end', requirePermission('impersonation:end'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  return c.json(await svc.end(c, ctx.userId));
});

export default router;
