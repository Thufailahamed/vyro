import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { listDeliveriesForSupplier, requireSupplierMember } from './listRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  try {
    await requireSupplierMember(c.env.DB, supplierId, ctx.userId);
  } catch {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const cursorRaw = c.req.query('cursor');
  const cursor = cursorRaw ? Number(cursorRaw) : undefined;
  const status = c.req.query('status');
  const items = await listDeliveriesForSupplier(
    c.env.DB,
    supplierId,
    cursor,
    status,
  );
  return c.json({ items });
});

export default router;
