import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminDataExportCreateBody, adminDataExportIdParam } from '@vyro/validation';
import type { Ctx } from '../../../middleware/session';
import * as svc from './dataExportService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.post('/', requirePermission('data_export:run'), async (c) => {
  const body = adminDataExportCreateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  const ctx = c.get('ctx') as Ctx;
  return c.json(await svc.request(c, body.data.userId, ctx.userId), 201);
});

router.get('/:id', requirePermission('data_export:run'), async (c) => {
  const param = adminDataExportIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.status(c.env.DB, param.data.id));
});

export default router;
