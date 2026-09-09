import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { getDb } from '@vyro/db';
import { auditLogs } from '@vyro/db/schema';
import { findDisputedPo, listDisputed, setPoStatus } from './disputeRepository';
import { eq } from 'drizzle-orm';
import { resolveGateway } from '@vyro/payments';
import { writeLedgerEntry } from '../ledger';
import {
  createRefund,
  updateRefundStatus,
} from '../refunds/repository';
import { recordAudit } from '../supplierProducts/repository';
import { auditAdmin } from './lib/audit';
import { notifyOrderParties } from '../notifications/dispatcher';
import { NotificationType } from '@vyro/shared';

type Ctx = { userId: string };

const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));

router.get('/disputes', async (c) => {
  const rows = await listDisputed(c.env.DB);
  return c.json({ disputes: rows });
});

const resolveSchema = z
  .object({
    outcome: z.enum(['refund_business', 'release_supplier']),
    note: z.string().max(500).optional(),
  })
  .strict();

router.post('/disputes/:poId/resolve', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('poId');
  if (!poId) throw httpError(400, 'VALIDATION_ERROR', 'Missing poId');
  const parsed = resolveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const po = await findDisputedPo(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (po.status !== 'disputed') throw httpError(409, 'CONFLICT', 'PO not disputed');

  const db = getDb(c.env.DB);

  if (parsed.data.outcome === 'refund_business') {
    // Find confirmed payments for this PO and refund each
    const schemaModule = await import('@vyro/db/schema');
    const paymentsTbl = schemaModule.payments;
    const paymentsToRefund = ((await db
      .select()
      .from(paymentsTbl)
      .where(eq(paymentsTbl.purchaseOrderId, poId))
      .all()) as any)
      .filter((p: any) => p.status === 'confirmed');

    for (const payment of paymentsToRefund) {
      const refund = await createRefund(c.env.DB, {
        paymentId: payment.id,
        amountCents: payment.amountCents,
        reason: parsed.data.note ?? 'Dispute resolved in favor of business',
        requestedByUserId: ctx.userId,
      });

      const useGateway = payment.method === 'online' && !!payment.gatewayRef;
      if (useGateway) {
        await updateRefundStatus(c.env.DB, refund.id, 'processing', { processedAt: null });
        const { adapter } = resolveGateway(c.env as Env);
        try {
          const result = await adapter.refund({
            paymentGatewayRef: payment.gatewayRef!,
            refundId: refund.id,
            amountCents: payment.amountCents,
            reason: parsed.data.note ?? '',
          });
          if (result.status === 'completed') {
            await updateRefundStatus(c.env.DB, refund.id, 'completed', {
              gatewayRefundId: result.gatewayRefundId,
              processedAt: Date.now(),
            });
          } else {
            await updateRefundStatus(c.env.DB, refund.id, 'failed', {
              failureReason: 'gateway refused',
              processedAt: Date.now(),
            });
          }
        } catch (e) {
          await updateRefundStatus(c.env.DB, refund.id, 'failed', {
            failureReason: String(e),
            processedAt: Date.now(),
          });
        }
      } else {
        // Offline refund: write ledger entries inline
        await updateRefundStatus(c.env.DB, refund.id, 'completed', { processedAt: Date.now() });
        const feeRefundCents = payment.feeCents > 0 ? Math.round((payment.amountCents * payment.feeCents) / payment.amountCents) : 0;
        await db.transaction(async (tx) => {
          writeLedgerEntry(tx as any, {
            accountType: 'business',
            accountId: po.businessId,
            direction: 'debit',
            amountCents: payment.amountCents,
            refType: 'refund',
            refId: refund.id,
            description: `Dispute refund for payment ${payment.id}`,
            createdByUserId: ctx.userId,
          });
          if (feeRefundCents > 0) {
            writeLedgerEntry(tx as any, {
              accountType: 'platform',
              accountId: 'platform',
              direction: 'debit',
              amountCents: feeRefundCents,
              refType: 'refund',
              refId: refund.id,
              description: `Platform fee refund for dispute ${refund.id}`,
              createdByUserId: ctx.userId,
            });
          }
        });
      }

      // Mark payment as refunded
      await db.update((await import('@vyro/db/schema')).payments)
        .set({ status: 'refunded', statusReason: parsed.data.note ?? null, updatedAt: Date.now() })
        .where(eq((await import('@vyro/db/schema')).payments.id, payment.id))
        .run();

      await recordAudit(c.env.DB, {
        actorUserId: ctx.userId,
        action: 'dispute.refund',
        resourceType: 'purchase_order',
        resourceId: poId,
        metadata: { refundId: refund.id, paymentId: payment.id, amountCents: payment.amountCents },
      });
    }

    await setPoStatus(c.env.DB, poId, 'cancelled', ctx.userId, parsed.data.note ?? 'dispute resolved: refund_business');
  } else {
    await setPoStatus(c.env.DB, poId, 'delivered', ctx.userId, parsed.data.note ?? 'dispute resolved: release_supplier');
  }

  const now = Date.now();
  // Fan out to both orgs — admin is the actor so they get nothing, and the
  // membership tables filter to humans who actually belong to each side.
  try {
    const title = parsed.data.outcome === 'refund_business' ? 'Dispute resolved: order refunded' : 'Dispute resolved: order released';
    const body = parsed.data.outcome === 'refund_business'
      ? 'Admin ruled in favor of the business. A refund has been processed.'
      : 'Admin ruled in favor of the supplier. Funds have been released.';
    await notifyOrderParties(
      c.env.DB,
      c.env.NOTIFICATIONS_QUEUE,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type: NotificationType.DISPUTE_RESOLVED,
        title,
        body: body + (parsed.data.note ? ` Note: ${parsed.data.note}` : ''),
        link: `/orders/${poId}`,
        audience: 'both',
      },
    );
  } catch (err) {
    console.error('[disputes.resolve] notify failed', err);
  }
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'dispute.resolved',
    resourceType: 'purchase_order',
    resourceId: poId,
    metadata: JSON.stringify({ outcome: parsed.data.outcome, note: parsed.data.note ?? null }),
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: now,
  });
  await auditAdmin({
    ctx: c,
    action: 'dispute.resolve',
    target: { type: 'purchase_order', id: poId },
    before: { status: 'disputed' },
    after: { status: parsed.data.outcome === 'refund_business' ? 'cancelled' : 'delivered', outcome: parsed.data.outcome },
  });

  return c.json({ ok: true, status: parsed.data.outcome === 'refund_business' ? 'cancelled' : 'delivered' });
});

export default router;
