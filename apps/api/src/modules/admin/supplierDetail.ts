import { Hono } from 'hono';
import type { Env } from '../../env';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { getSupplierDetailForAdmin } from './supplierDetailRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', requireRole({ admin: true }));

router.get('/suppliers/:id', async (c) => {
  const detail = await getSupplierDetailForAdmin(c.env.DB, c.req.param('id'));
  if (!detail) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  return c.json({ supplier: detail });
});

export default router;
