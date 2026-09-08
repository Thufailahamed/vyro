import { Hono } from 'hono';
import { z } from 'zod';
import { checkoutSchema } from '@vyro/validation/cart';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import {
  hasBusinessAccess,
  hasSupplierAccess,
  requireBusinessRole,
  requireSupplierRole,
} from '@vyro/auth';
import { checkoutService } from './service';
import { findPurchaseOrder, listEventsForPo } from './eventsRepository';
import {
  findPo,
  listPoEvents,
  listPoItems,
  listPosForBusiness,
  listPosForSupplier,
} from './repository';
import { OrderStatus } from '@vyro/shared';

const ORDER_STATUS_VALUES = Object.values(OrderStatus) as [string, ...string[]];

const router = new Hono<{ Bindings: Env }>();

const PO_BUSINESS_ROLES = ['owner', 'manager', 'staff'] as const;
const PO_SUPPLIER_ROLES = ['owner', 'sales', 'operations'] as const;

const transitionSchema = z
  .object({ to: z.enum(ORDER_STATUS_VALUES), reason: z.string().max(500).optional() })
  .strict();

router.post('/checkout', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  requireBusinessRole(ctx, parsed.data.businessId, PO_BUSINESS_ROLES);

  const out = await checkoutService.checkout(
    c.env.DB,
    ctx.userId,
    parsed.data,
    c.env.NOTIFICATIONS_QUEUE,
  );
  return c.json(out, 201);
});

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId');
  const supplierId = c.req.query('supplierId');
  if (!businessId && !supplierId)
    throw httpError(400, 'VALIDATION_ERROR', 'businessId or supplierId required');
  if (businessId) {
    requireBusinessRole(ctx, businessId, PO_BUSINESS_ROLES);
    const pos = await listPosForBusiness(c.env.DB, businessId);
    return c.json({ orders: pos });
  }
  if (supplierId) {
    requireSupplierRole(ctx, supplierId, PO_SUPPLIER_ROLES);
    const pos = await listPosForSupplier(c.env.DB, supplierId);
    return c.json({ orders: pos });
  }
  return c.json({ orders: [] });
});

router.get('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const po = await findPo(c.env.DB, c.req.param('id'));
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  const isBiz = hasBusinessAccess(ctx, po.businessId);
  const isSup = !isBiz && hasSupplierAccess(ctx, po.supplierId);
  if (!isBiz && !isSup && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'No access');
  const items = await listPoItems(c.env.DB, po.id);
  const events = await listPoEvents(c.env.DB, po.id);
  return c.json({ order: po, items, events });
});

router.post('/:id/transition', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = transitionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const po = await findPo(c.env.DB, c.req.param('id'));
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');

  let actorRole: 'business' | 'supplier' | 'admin';
  if (ctx.isAdmin) actorRole = 'admin';
  else if (hasBusinessAccess(ctx, po.businessId)) actorRole = 'business';
  else if (hasSupplierAccess(ctx, po.supplierId)) actorRole = 'supplier';
  else throw httpError(403, 'FORBIDDEN', 'No access');

  await checkoutService.transition(
    c.env.DB,
    {
      poId: po.id,
      to: parsed.data.to as never,
      actor: { role: actorRole, userId: ctx.userId },
      reason: parsed.data.reason ?? null,
    },
    c.env.NOTIFICATIONS_QUEUE,
  );
  return c.json({ ok: true });
});

router.get('/:id/events', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('id');
  const po = await findPurchaseOrder(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  // Only participants (or admins) may read an order's timeline.
  const isBiz = hasBusinessAccess(ctx, po.businessId);
  const isSup = !isBiz && hasSupplierAccess(ctx, po.supplierId);
  if (!isBiz && !isSup && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'No access');
  const events = await listEventsForPo(c.env.DB, poId);
  return c.json({ events });
});

router.post('/:id/reorder', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const sourcePoId = c.req.param('id');
  const sourcePo = await findPo(c.env.DB, sourcePoId);
  if (!sourcePo) throw httpError(404, 'NOT_FOUND', 'Order not found');
  // Only the buyer side may reorder — suppliers don't place reorders.
  requireBusinessRole(ctx, sourcePo.businessId, PO_BUSINESS_ROLES);
  const out = await checkoutService.reorder(
    c.env.DB,
    ctx.userId,
    sourcePoId,
    c.env.NOTIFICATIONS_QUEUE,
  );
  return c.json(out, 201);
});

import messagesRouter from './messages';
router.route('/', messagesRouter);

export default router;
