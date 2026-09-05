import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminEmailTemplatesUpdateBody } from '@vyro/validation';
import * as svc from './configSectionsService';

const SECTION = 'email_templates';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('email_template:read'), async (c) => {
  return c.json(await svc.read(c.env.DB, SECTION));
});

router.put('/', requirePermission('email_template:write'), async (c) => {
  const body = adminEmailTemplatesUpdateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(await svc.update(c, SECTION, body.data.value, body.data.expectedVersion));
});

export default router;
