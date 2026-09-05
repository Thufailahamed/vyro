import { Hono } from 'hono';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { snapshot } from './healthService';

const router = new Hono<{ Bindings: { DB: D1Database } }>();

router.use('*', session());
router.get('/', requirePermission('health:read'), async (c) => {
  const snap = await snapshot(c.env.DB);
  return c.json(snap);
});

export default router;
