import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminFeatureFlagsUpdateBody } from '@vyro/validation';
import * as svc from './configSectionsService';

const SECTION = 'feature_flags';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('feature_flag:read'), async (c) => {
  return c.json(await svc.read(c.env.DB, SECTION));
});

router.put('/', requirePermission('feature_flag:write'), async (c) => {
  const body = adminFeatureFlagsUpdateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(await svc.update(c, SECTION, body.data.value, body.data.expectedVersion));
});

export default router;
