import { Hono } from 'hono';
import { confirmPaymentSchema, createPaymentSchema } from '@vyro/validation/payment';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { businessMembers, supplierMembers, payments, purchaseOrders } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import { recordAudit } from '../supplierProducts/repository';
import { listPaymentsForSupplier, requireSupplierMember } from './listRepository';

const router = new Hono<{ Bindings: Env }>();

async function rolesForPo(d1: D1Database, poId: string, userId: string, isAdmin: boolean) {
  const db = getDb(d1);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
  if (!po) return { role: null as null | 'admin' | 'business' | 'supplier', po: null };
  if (isAdmin) return { role: 'admin' as const, po };
  const inBiz = await db.select().from(businessMembers).where(and(eq(businessMembers.businessId, po.businessId), eq(businessMembers.userId, userId))).get();
  if (inBiz) return { role: 'business' as const, po };
  const inSup = await db.select().from(supplierMembers).where(and(eq(supplierMembers.supplierId, po.supplierId), eq(supplierMembers.userId, userId))).get();
  if (inSup) return { role: 'supplier' as const, po };
  return { role: null, po };
}

router.post('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = createPaymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const { role, po } = await rolesForPo(c.env.DB, parsed.data.purchaseOrderId, ctx.userId, ctx.isAdmin);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (role !== 'business' && role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Only business/admin record payments');

  const db = getDb(c.env.DB);
  const id = newId();
  const now = Date.now();
  await db.insert(payments).values({
    id,
    purchaseOrderId: po.id,
    method: parsed.data.method,
    status: 'pending',
    amountCents: po.totalCents,
    currency: po.currency,
    transactionReference: parsed.data.transactionReference ?? null,
    notes: parsed.data.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'payment.create',
    resourceType: 'purchase_order',
    resourceId: po.id,
    metadata: { paymentId: id, method: parsed.data.method, amountCents: po.totalCents },
  });
  return c.json({ id }, 201);
});

router.post('/:id/confirm', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = confirmPaymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const db = getDb(c.env.DB);
  const payment = await db.select().from(payments).where(eq(payments.id, c.req.param('id'))).get();
  if (!payment) throw httpError(404, 'NOT_FOUND', 'Payment not found');
  const { role } = await rolesForPo(c.env.DB, payment.purchaseOrderId, ctx.userId, ctx.isAdmin);
  if (role !== 'supplier' && role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Only supplier/admin confirm');

  const now = Date.now();
  await db.update(payments).set({
    status: parsed.data.status,
    confirmedByUserId: ctx.userId,
    confirmedAt: now,
    paidAt: parsed.data.status === 'confirmed' ? now : payment.paidAt,
    updatedAt: now,
  }).where(eq(payments.id, payment.id));

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: `payment.${parsed.data.status}`,
    resourceType: 'purchase_order',
    resourceId: payment.purchaseOrderId,
    metadata: { paymentId: payment.id, reason: parsed.data.reason ?? null },
  });
  return c.json({ ok: true });
});

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
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
  const items = await listPaymentsForSupplier(c.env.DB, supplierId, cursor, status);
  return c.json({ items });
});

router.get('/by-po/:poId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const { role } = await rolesForPo(c.env.DB, c.req.param('poId'), ctx.userId, ctx.isAdmin);
  if (!role) throw httpError(403, 'FORBIDDEN', 'No access');
  const db = getDb(c.env.DB);
  const list = await db.select().from(payments).where(eq(payments.purchaseOrderId, c.req.param('poId'))).all();
  return c.json({ payments: list });
});

export default router;
