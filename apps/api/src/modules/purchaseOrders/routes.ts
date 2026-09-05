import { Hono } from 'hono';
import { z } from 'zod';
import { checkoutSchema } from '@vyro/validation/cart';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { businessMembers, supplierMembers, businesses, suppliers } from '@vyro/db/schema';
import { and, eq, sql } from 'drizzle-orm';
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

const transitionSchema = z
  .object({ to: z.enum(ORDER_STATUS_VALUES), reason: z.string().max(500).optional() })
  .strict();

async function requireBusinessMember(
  d1: D1Database,
  businessId: string,
  userId: string,
): Promise<'owner' | 'manager' | 'staff' | null> {
  const db = getDb(d1);
  const row = await db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, userId)))
    .get();
  return (row?.role as 'owner' | 'manager' | 'staff' | undefined) ?? null;
}

async function requireSupplierMember(
  d1: D1Database,
  supplierId: string,
  userId: string,
): Promise<'owner' | 'manager' | 'staff' | null> {
  const db = getDb(d1);
  const row = await db
    .select()
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  return (row?.role as 'owner' | 'manager' | 'staff' | undefined) ?? null;
}

router.post('/checkout', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const role = await requireBusinessMember(c.env.DB, parsed.data.businessId, ctx.userId);
  if (!role) throw httpError(403, 'FORBIDDEN', 'Not a business member');

  const out = await checkoutService.checkout(c.env.DB, ctx.userId, parsed.data);
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
    const role = await requireBusinessMember(c.env.DB, businessId, ctx.userId);
    if (!role) throw httpError(403, 'FORBIDDEN', 'Not a business member');
    const pos = await listPosForBusiness(c.env.DB, businessId);
    return c.json({ orders: pos });
  }
  if (supplierId) {
    const role = await requireSupplierMember(c.env.DB, supplierId, ctx.userId);
    if (!role) throw httpError(403, 'FORBIDDEN', 'Not a supplier member');
    const pos = await listPosForSupplier(c.env.DB, supplierId);
    return c.json({ orders: pos });
  }
  void sql; void getDb; void businesses; void suppliers;
  return c.json({ orders: [] });
});

router.get('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const po = await findPo(c.env.DB, c.req.param('id'));
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  const bizRole = await requireBusinessMember(c.env.DB, po.businessId, ctx.userId);
  const supRole = bizRole ? null : await requireSupplierMember(c.env.DB, po.supplierId, ctx.userId);
  if (!bizRole && !supRole && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'No access');
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

  let role: 'business' | 'supplier' | 'admin' = 'admin';
  if (ctx.isAdmin) role = 'admin';
  else if (await requireBusinessMember(c.env.DB, po.businessId, ctx.userId)) role = 'business';
  else if (await requireSupplierMember(c.env.DB, po.supplierId, ctx.userId)) role = 'supplier';
  else throw httpError(403, 'FORBIDDEN', 'No access');
  const typedRole = role as 'business' | 'supplier' | 'admin';

  await checkoutService.transition(c.env.DB, {
    poId: po.id,
    to: parsed.data.to as any,
    actor: { role: typedRole, userId: ctx.userId },
    reason: parsed.data.reason ?? null,
  });
  return c.json({ ok: true });
});

router.get('/:id/events', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('id');
  const po = await findPurchaseOrder(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  const events = await listEventsForPo(c.env.DB, poId);
  return c.json({ events });
});

import messagesRouter from './messages';
router.route('/', messagesRouter);

export default router;
