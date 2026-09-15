import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { requireSupplierRole } from '@vyro/auth';
import { trustSealService } from './service';

const router = new Hono<{ Bindings: Env }>();

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

router.use('*', session());

router.get('/:supplierId/status', async (c) => {
  const ctx = ctxOf(c);
  const supplierId = c.req.param('supplierId');
  requireSupplierRole(ctx, supplierId, ['owner', 'sales', 'operations']);
  return c.json(await trustSealService.getStatus(c.env.DB, supplierId));
});

router.post('/:supplierId/checkout', async (c) => {
  const ctx = ctxOf(c);
  const supplierId = c.req.param('supplierId');
  requireSupplierRole(ctx, supplierId, ['owner']);
  return c.json(await trustSealService.startCheckout(c.env.DB, supplierId, c.env), 201);
});

export default router;
