import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminChargebackIdParam, adminChargebackResolveBody } from '@vyro/validation';
import * as svc from './chargebacksService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('payment:read'), async (c) => {
  return c.json(await svc.listOpen(c.env.DB));
});

router.post('/:id/resolve', requirePermission('payment:refund'), async (c) => {
  const param = adminChargebackIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminChargebackResolveBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.resolve(c, param.data.id, {
      ...(body.data.notes !== undefined ? { notes: body.data.notes } : {}),
      ...(body.data.refundId !== undefined ? { refundId: body.data.refundId } : {}),
    }),
  );
});

export default router;
