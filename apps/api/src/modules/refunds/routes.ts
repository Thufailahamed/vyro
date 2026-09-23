import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { payments as paymentsTable, purchaseOrders, businessMembers } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { createRefundSchema } from '@vyro/validation/payment';
import { findRefund, listRefundsForPayment } from './repository';
import { executeRefund } from './executor';
import { requireBusinessPaymentRole, isSupplierMember } from '../payments/membership';

const router = new Hono<{ Bindings: Env }>();

async function loadPaymentAndPo(d1: D1Database, paymentId: string): Promise<{
  payment: typeof paymentsTable.$inferSelect;
  po: typeof purchaseOrders.$inferSelect;
} | null> {
  const db = getDb(d1);
  const payment = (await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId)).get()) as any;
  if (!payment) return null;
  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get()) as any;
  if (!po) return null;
  return { payment, po };
}

async function canReadPayment(
  d1: D1Database,
  ctx: Ctx,
  po: typeof purchaseOrders.$inferSelect,
): Promise<boolean> {
  if (ctx.isAdmin) return true;
  if (await isSupplierMember(d1, po.supplierId, ctx.userId)) return true;
  const db = getDb(d1);
  const m = await db
    .select()
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, po.businessId),
        eq(businessMembers.userId, ctx.userId),
        eq(businessMembers.status, 'active'),
      ),
    )
    .get();
  return !!m;
}

router.post('/:paymentId/refund', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = createRefundSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const loaded = await loadPaymentAndPo(c.env.DB, c.req.param('paymentId'));
  if (!loaded) throw httpError(404, 'NOT_FOUND', 'Payment not found');
  const { payment, po } = loaded;

  if (payment.status !== 'confirmed') {
    throw httpError(409, 'CONFLICT', `Only confirmed payments can be refunded (current: ${payment.status})`);
  }

  // RBAC: business owner/purchasing or admin
  if (!ctx.isAdmin) {
    const allowed = await (async () => {
      try {
        await requireBusinessPaymentRole(c.env.DB, po.businessId, ctx.userId);
        return true;
      } catch {
        return false;
      }
    })();
    if (!allowed) throw httpError(403, 'FORBIDDEN', 'Insufficient role to refund');
  }

  // One executor for every refund. Buyers raise a request that ops approve
  // (offline money may be held by the supplier); admins process immediately.
  const outcome = await executeRefund(c.env, {
    paymentId: payment.id,
    ...(parsed.data.amountCents !== undefined ? { amountCents: parsed.data.amountCents } : {}),
    source: 'manual',
    reason: parsed.data.reason ?? null,
    actorUserId: ctx.userId,
    idempotencyKey: c.req.header('idempotency-key')
      ? `manual:${payment.id}:${c.req.header('idempotency-key')}`
      : `manual:${payment.id}:${crypto.randomUUID()}`,
    mode: ctx.isAdmin ? 'auto' : 'queue',
  });
  if (!outcome) throw httpError(409, 'CONFLICT', 'Payment already fully refunded');
  const fresh = (await findRefund(c.env.DB, outcome.refundId))!;
  if (fresh.status === 'failed') throw httpError(502, 'INTERNAL', 'Gateway refund failed');

  return c.json({ id: fresh.id, status: fresh.status, amountCents: fresh.amountCents }, 201);
});

router.get('/:paymentId/refunds', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const loaded = await loadPaymentAndPo(c.env.DB, c.req.param('paymentId'));
  if (!loaded) throw httpError(404, 'NOT_FOUND', 'Payment not found');
  const { po } = loaded;
  if (!(await canReadPayment(c.env.DB, ctx, po))) {
    throw httpError(403, 'FORBIDDEN', 'No access');
  }
  const items = await listRefundsForPayment(c.env.DB, c.req.param('paymentId'));
  return c.json({ refunds: items });
});

router.get('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const refund = await findRefund(c.env.DB, c.req.param('id'));
  if (!refund) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  const loaded = await loadPaymentAndPo(c.env.DB, refund.paymentId);
  if (!loaded) throw httpError(404, 'NOT_FOUND', 'Underlying payment missing');
  if (!(await canReadPayment(c.env.DB, ctx, loaded.po))) {
    throw httpError(403, 'FORBIDDEN', 'No access');
  }
  return c.json({ refund });
});

export default router;
