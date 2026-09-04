import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { findPurchaseOrder, listEventsForPo } from './eventsRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/:id/events', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const poId = c.req.param('id');
  const po = await findPurchaseOrder(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!ctx.isAdmin) {
    void po;
  }
  const events = await listEventsForPo(c.env.DB, poId);
  return c.json({ events });
});

export default router;
