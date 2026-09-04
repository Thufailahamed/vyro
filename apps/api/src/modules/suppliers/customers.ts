import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { ensureSupplierMember, listCustomersForSupplier } from './customersRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/:id/customers', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const supplierId = c.req.param('id');
  if (!ctx.userId) throw httpError(401, 'UNAUTHORIZED', 'No session');
  await ensureSupplierMember(c.env.DB, supplierId, ctx.userId);
  const items = await listCustomersForSupplier(c.env.DB, supplierId);
  return c.json({ items });
});

export default router;
