import { Hono } from 'hono';
import type { Env } from '../../env';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { getBusinessDetailForAdmin } from './businessDetailRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', requireRole({ admin: true }));

router.get('/businesses/:id', async (c) => {
  const detail = await getBusinessDetailForAdmin(c.env.DB, c.req.param('id'));
  if (!detail) throw httpError(404, 'NOT_FOUND', 'Business not found');
  return c.json({ business: detail });
});

export default router;
