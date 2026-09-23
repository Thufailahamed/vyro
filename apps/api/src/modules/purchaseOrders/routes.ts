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
import { OrderStatus, allowedTransitions, type ActorRole } from '@vyro/shared';
import { partialAcceptSchema } from '@vyro/validation/orderLifecycle';
import { applyTransition } from '../orders/lifecycle';
import { acceptOrder } from '../orders/partialAccept';
import { getPaymentSummary, getPaymentSummaries } from '../payments/summary';
import { getLifecycleConfig, DAY_MS } from '../orders/config';
import { findDeliveryByPo } from '../deliveries/repository';
import { listReturnsForPo } from '../returns/repository';

const ORDER_STATUS_VALUES = Object.values(OrderStatus) as [string, ...string[]];

const router = new Hono<{ Bindings: Env }>();

const PO_BUSINESS_ROLES = ['owner', 'manager', 'purchasing'] as const;
const PO_SUPPLIER_ROLES = ['owner', 'sales', 'operations'] as const;

async function withPaymentState<T extends { id: string; totalCents: number }>(d1: D1Database, rows: T[]) {
  const summaries = await getPaymentSummaries(d1, rows).catch(() => new Map());
  return rows.map((r) => {
    const s = summaries.get(r.id);
    return { ...r, paymentState: s?.state ?? null, paymentMethodSummary: s?.method ?? null };
  });
}

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
    c.env,
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
  const directionRaw = c.req.query('direction');
  const direction =
    directionRaw === 'domestic' || directionRaw === 'export' || directionRaw === 'import'
      ? directionRaw
      : undefined;
  if (!businessId && !supplierId)
    throw httpError(400, 'VALIDATION_ERROR', 'businessId or supplierId required');
  if (businessId) {
    requireBusinessRole(ctx, businessId, PO_BUSINESS_ROLES);
    const pos = await listPosForBusiness(c.env.DB, businessId, direction ? { direction } : undefined);
    return c.json({ orders: await withPaymentState(c.env.DB, pos) });
  }
  if (supplierId) {
    requireSupplierRole(ctx, supplierId, PO_SUPPLIER_ROLES);
    const pos = await listPosForSupplier(c.env.DB, supplierId, direction ? { direction } : undefined);
    return c.json({ orders: await withPaymentState(c.env.DB, pos) });
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
  // `?as=supplier` lets a user who is on both sides (or an admin) view the
  // supplier's action set explicitly.
  const asParam = c.req.query('as');
  const viewerRole: ActorRole = ctx.isAdmin && !asParam
    ? 'admin'
    : asParam === 'supplier' && hasSupplierAccess(ctx, po.supplierId)
      ? 'supplier'
      : isBiz
        ? 'business'
        : 'supplier';
  const [items, events, paymentSummary, delivery, cfg, returnsList] = await Promise.all([
    listPoItems(c.env.DB, po.id),
    listPoEvents(c.env.DB, po.id),
    getPaymentSummary(c.env.DB, po.id),
    findDeliveryByPo(c.env.DB, po.id),
    getLifecycleConfig(c.env.DB),
    listReturnsForPo(c.env.DB, po.id),
  ]);
  const deliveredBase = po.deliveredAt ?? po.completedAt ?? null;
  const lifecycle = {
    viewerRole,
    allowedTransitions: allowedTransitions(po.status as OrderStatus, viewerRole),
    disputeWindowEndsAt: deliveredBase ? deliveredBase + cfg.disputeWindowDays * DAY_MS : null,
    returnWindowEndsAt:
      deliveredBase && cfg.returnsEnabled ? deliveredBase + cfg.returnWindowDays * DAY_MS : null,
    autoCompleteAt: po.status === 'delivered' && po.deliveredAt ? po.deliveredAt + cfg.autoCompleteDays * DAY_MS : null,
    autoCancelAt:
      po.status === 'pending' && (!cfg.automationSince || po.createdAt >= cfg.automationSince)
        ? po.createdAt + cfg.pendingAutoCancelHours * 60 * 60 * 1000
        : null,
    paymentGateEnabled: cfg.paymentGateEnabled,
    returnsEnabled: cfg.returnsEnabled,
  };
  // POD photo keys are internal; expose only whether one exists.
  const safeDelivery = delivery ? { ...delivery, podPhotoKey: undefined, hasPodPhoto: !!delivery.podPhotoKey } : null;
  return c.json({ order: po, items, events, paymentSummary, delivery: safeDelivery, returns: returnsList, lifecycle });
});

router.post('/:id/wire-instructions', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('id');
  const po = await findPo(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!hasBusinessAccess(ctx, po.businessId)) {
    throw httpError(403, 'FORBIDDEN', 'No business access');
  }
  if (po.direction === 'domestic') {
    throw httpError(400, 'VALIDATION_ERROR', 'Wire only applies to cross-border orders');
  }
  const { buildWireInstructions } = await import('../cross-border/wireInstructions');
  const out = await buildWireInstructions(c.env, {
    poId,
    businessId: po.businessId,
    userId: ctx.userId,
  });
  return c.json(out);
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
  else if (hasBusinessAccess(ctx, po.businessId)) {
    // Same roles that may place orders may cancel / complete / dispute them.
    requireBusinessRole(ctx, po.businessId, PO_BUSINESS_ROLES);
    actorRole = 'business';
  } else if (hasSupplierAccess(ctx, po.supplierId)) {
    requireSupplierRole(ctx, po.supplierId, PO_SUPPLIER_ROLES);
    actorRole = 'supplier';
  } else throw httpError(403, 'FORBIDDEN', 'No access');

  const out = await applyTransition(c.env, {
    poId: po.id,
    to: parsed.data.to as never,
    actor: { role: actorRole, userId: ctx.userId },
    reason: parsed.data.reason ?? null,
  });
  return c.json({ ok: true, status: out.to, refunds: out.refunds });
});

router.post('/:id/accept', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = partialAcceptSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const po = await findPo(c.env.DB, c.req.param('id'));
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  let role: 'supplier' | 'admin';
  if (ctx.isAdmin) role = 'admin';
  else {
    requireSupplierRole(ctx, po.supplierId, PO_SUPPLIER_ROLES);
    role = 'supplier';
  }
  const out = await acceptOrder(c.env, {
    poId: po.id,
    actor: { role, userId: ctx.userId },
    lines: parsed.data.lines,
    note: parsed.data.note ?? null,
  });
  return c.json(out);
});

router.get('/:id/payment-summary', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const po = await findPo(c.env.DB, c.req.param('id'));
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!hasBusinessAccess(ctx, po.businessId) && !hasSupplierAccess(ctx, po.supplierId) && !ctx.isAdmin) {
    throw httpError(403, 'FORBIDDEN', 'No access');
  }
  return c.json({ paymentSummary: await getPaymentSummary(c.env.DB, po.id) });
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
