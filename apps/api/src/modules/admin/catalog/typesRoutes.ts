import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import {
  adminBusinessTypeCreateBody,
  adminBusinessTypeUpdateBody,
  adminBusinessTypeIdParam,
} from '@vyro/validation';
import * as svc from './typesService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/business', requirePermission('type:read'), async (c) => {
  return c.json(await svc.listBusinessTypes(c.env.DB));
});

router.post('/business', requirePermission('type:write'), async (c) => {
  const body = adminBusinessTypeCreateBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(await svc.createBusinessType(c, body.data), 201);
});

router.patch('/business/:id', requirePermission('type:write'), async (c) => {
  const param = adminBusinessTypeIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminBusinessTypeUpdateBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.updateBusinessType(c, param.data.id, {
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.active !== undefined ? { active: body.data.active } : {}),
    }),
  );
});

router.delete('/business/:id', requirePermission('type:write'), async (c) => {
  const param = adminBusinessTypeIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.softDeleteBusinessType(c, param.data.id));
});

export default router;
