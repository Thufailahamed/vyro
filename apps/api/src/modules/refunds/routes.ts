import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { payments as paymentsTable, purchaseOrders, businessMembers } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { createRefundSchema } from '@vyro/validation/payment';
import { NotificationType } from '@vyro/shared';
import { recordAudit } from '../supplierProducts/repository';
import { resolveGateway } from '@vyro/payments';
import { writeLedgerEntry } from '../ledger';
import {
  createRefund,
  findRefund,
  listRefundsForPayment,
  sumCompletedRefundsForPayment,
  updateRefundStatus,
} from './repository';
import { requireBusinessPaymentRole, isSupplierMember } from '../payments/membership';
import { notifyOrderParties } from '../notifications/dispatcher';

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

  // Amount validation
  const alreadyRefunded = await sumCompletedRefundsForPayment(c.env.DB, payment.id);
  const maxRefundable = payment.amountCents - alreadyRefunded;
  if (maxRefundable <= 0) {
    throw httpError(409, 'CONFLICT', 'Payment already fully refunded');
  }
  const refundCents = parsed.data.amountCents ?? maxRefundable;
  if (refundCents > maxRefundable) {
    throw httpError(400, 'VALIDATION_ERROR', `refund amount exceeds refundable (${maxRefundable})`);
  }

  // Proportional fee refund
  const feeRefundCents = payment.feeCents > 0
    ? Math.round((refundCents * payment.feeCents) / payment.amountCents)
    : 0;

  const db = getDb(c.env.DB);
  const refund = await db.transaction(async (tx) => {
    const refundRow = await createRefund(c.env.DB, {
      paymentId: payment.id,
      amountCents: refundCents,
      reason: parsed.data.reason ?? null,
      requestedByUserId: ctx.userId,
    });

    // Update payment status if fully refunded
    const newRefundedTotal = alreadyRefunded + refundCents;
    if (newRefundedTotal >= payment.amountCents) {
      tx.update(paymentsTable)
        .set({
          status: 'refunded',
          statusReason: parsed.data.reason ?? null,
          updatedAt: Date.now(),
        })
        .where(eq(paymentsTable.id, payment.id))
        .run();
    }

    // Gateway call (online) OR mark completed (offline)
    const env = c.env as Env;
    const { adapter } = resolveGateway(env);
    const useGateway = payment.method === 'online' && !!payment.gatewayRef;

    if (useGateway) {
      await updateRefundStatus(c.env.DB, refundRow.id, 'processing', { processedAt: null });
      const result = await adapter.refund({
        paymentGatewayRef: payment.gatewayRef!,
        refundId: refundRow.id,
        amountCents: refundCents,
        reason: parsed.data.reason ?? '',
      });
      if (result.status === 'completed') {
        await updateRefundStatus(c.env.DB, refundRow.id, 'completed', {
          gatewayRefundId: result.gatewayRefundId,
          processedAt: Date.now(),
        });
      } else if (result.status === 'failed') {
        await updateRefundStatus(c.env.DB, refundRow.id, 'failed', {
          failureReason: 'gateway refused refund',
          processedAt: Date.now(),
        });
        throw httpError(502, 'INTERNAL', 'Gateway refund failed');
      } else {
        // pending: webhook will finalize
      }
    } else {
      // Offline refund: mark completed immediately and write ledger
      await updateRefundStatus(c.env.DB, refundRow.id, 'completed', { processedAt: Date.now() });
      writeLedgerEntry(tx as any, {
        accountType: 'business',
        accountId: po.businessId,
        direction: 'debit',
        amountCents: refundCents,
        refType: 'refund',
        refId: refundRow.id,
        description: `Refund for payment ${payment.id}`,
        createdByUserId: ctx.userId,
      });
      if (feeRefundCents > 0) {
        writeLedgerEntry(tx as any, {
          accountType: 'platform',
          accountId: 'platform',
          direction: 'debit',
          amountCents: feeRefundCents,
          refType: 'refund',
          refId: refundRow.id,
          description: `Platform fee refund ${refundRow.id}`,
          createdByUserId: ctx.userId,
        });
      }
    }

    return refundRow;
  });

  const fresh = (await findRefund(c.env.DB, refund.id)) ?? refund;

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'refund.create',
    resourceType: 'purchase_order',
    resourceId: po.id,
    metadata: {
      refundId: fresh.id,
      paymentId: payment.id,
      amountCents: refundCents,
      feeRefundCents,
    },
  });

  // Best-effort buyer + supplier notifications.
  try {
    const initiated = fresh.status === 'requested' || fresh.status === 'processing';
    await notifyOrderParties(
      c.env.DB,
      c.env.NOTIFICATIONS_QUEUE,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type: initiated ? NotificationType.REFUND_INITIATED : NotificationType.REFUND_COMPLETED,
        title: initiated
          ? `Refund requested for PO ${po.poNumber}`
          : `Refund completed for PO ${po.poNumber}`,
        body: initiated
          ? `A refund of ${refundCents} cents is being processed.`
          : `A refund of ${refundCents} cents has been completed.`,
        link: `/orders/${po.id}`,
        audience: 'both',
        excludeUserId: ctx.userId,
      },
    );
  } catch (err) {
    console.error('[refunds.create] notify failed', err);
  }

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
