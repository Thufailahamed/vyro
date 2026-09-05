import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import {
  adminRefundQueueQuery,
  adminRefundIdParam,
  adminRefundRejectBody,
} from '@vyro/validation';
import * as svc from './refundsService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/queue', requirePermission('payment:read'), async (c) => {
  const parsed = adminRefundQueueQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  return c.json(await svc.listQueue(c.env.DB, parsed.data));
});

router.post('/:id/approve', requirePermission('payment:refund'), async (c) => {
  const param = adminRefundIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.approve(c, param.data.id));
});

router.post('/:id/reject', requirePermission('payment:refund'), async (c) => {
  const param = adminRefundIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminRefundRejectBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(await svc.reject(c, param.data.id, body.data.reason));
});

export default router;
