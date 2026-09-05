import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import {
  adminPayoutBatchCreateBody,
  adminPayoutBatchIdParam,
} from '@vyro/validation';
import * as svc from './payoutBatchesService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/queue', requirePermission('payout:read'), async (c) => {
  return c.json(await svc.listQueue(c.env.DB, {}));
});

router.post('/batch', requirePermission('payout:approve'), async (c) => {
  const body = adminPayoutBatchCreateBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.createBatch(c, {
      ...(body.data.note !== undefined ? { note: body.data.note } : {}),
      ...(body.data.supplierIds !== undefined ? { supplierIds: body.data.supplierIds } : {}),
    }),
    201,
  );
});

router.post('/:batchId/approve', requirePermission('payout:approve'), async (c) => {
  const param = adminPayoutBatchIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.approveBatch(c, param.data.batchId));
});

export default router;
