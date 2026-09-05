import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import {
  adminWebhookCreateBody,
  adminWebhookUpdateBody,
  adminWebhookIdParam,
  adminWebhookDeliveryIdParam,
} from '@vyro/validation';
import * as svc from './webhooksService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('webhook:read'), async (c) => {
  return c.json(await svc.list(c.env.DB));
});

router.post('/', requirePermission('webhook:write'), async (c) => {
  const body = adminWebhookCreateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.create(c, {
      name: body.data.name,
      url: body.data.url,
      eventTypes: body.data.eventTypes,
      secret: body.data.secret,
      ...(body.data.active !== undefined ? { active: body.data.active } : {}),
    }),
    201,
  );
});

router.patch('/:id', requirePermission('webhook:write'), async (c) => {
  const param = adminWebhookIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminWebhookUpdateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.update(c, param.data.id, {
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.url !== undefined ? { url: body.data.url } : {}),
      ...(body.data.eventTypes !== undefined ? { eventTypes: body.data.eventTypes } : {}),
      ...(body.data.active !== undefined ? { active: body.data.active } : {}),
    }),
  );
});

router.delete('/:id', requirePermission('webhook:write'), async (c) => {
  const param = adminWebhookIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.disable(c, param.data.id));
});

router.get('/:id/deliveries', requirePermission('webhook:read'), async (c) => {
  const param = adminWebhookIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.listDeliveries(c.env.DB, param.data.id));
});

router.post('/:id/retry/:deliveryId', requirePermission('webhook:retry'), async (c) => {
  const param = adminWebhookDeliveryIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.retryDelivery(c, param.data.id, param.data.deliveryId));
});

export default router;
