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
  const limitRaw = Number(c.req.query('limit') ?? 20);
  const page = await listCustomersForSupplier(c.env.DB, supplierId, {
    cursor: c.req.query('cursor') ?? null,
    limit: Number.isFinite(limitRaw) ? limitRaw : 20,
  });
  return c.json(page);
});

export default router;
