import { Hono } from 'hono';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { payments as paymentsTable, purchaseOrders } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { resolveGateway } from '@vyro/payments';
import { writeLedgerEntry } from '../ledger';
import { generateReceiptForPayment } from '../invoices/generate';
import { recordAudit } from '../supplierProducts/repository';
import { httpError } from '../../lib/errors';
import { notifyOrderParties } from '../notifications/dispatcher';
import { NotificationType } from '@vyro/shared';

const router = new Hono<{ Bindings: Env }>();

/**
 * PayHere notify_url endpoint. Body is form-encoded.
 * Signature is verified by the adapter against the raw body.
 *
 * Webhook idempotency: payment.idempotencyKey column UNIQUE prevents duplicate
 * status flips; we check status before writing.
 */
router.post('/payhere', async (c) => {
  const raw = await c.req.text();
  const env = c.env as Env;
  const { adapter, provider } = resolveGateway(env);

  // Signature verification
  if (!adapter.verifySignature(raw, null)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid webhook signature');
  }

  const event = await adapter.parseWebhook(raw, null);

  // Look up payment by gatewayRef
  const db = getDb(env.DB);
  const payment = (await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.gatewayRef, event.gatewayRef))
    .get()) as any;
  if (!payment) {
    // Could be out-of-order or for a different order; log and ack
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'webhook.unknown_payment',
      resourceType: 'payment',
      resourceId: event.gatewayRef,
      metadata: { event, provider },
    });
    return c.json({ ok: true, ignored: true });
  }

  // Idempotent status update
  if (payment.status !== 'pending') {
    return c.json({ ok: true, alreadyProcessed: true });
  }

  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get()) as any;
  if (!po) {
    return c.json({ ok: true, ignored: 'po-missing' });
  }

  if (event.type === 'payment.success') {
    const now = Date.now();
    await db.transaction(async (tx) => {
      tx.update(paymentsTable)
        .set({
          status: 'confirmed',
          confirmedAt: now,
          paidAt: now,
          updatedAt: now,
        })
        .where(eq(paymentsTable.id, payment.id))
        .run();
      writeLedgerEntry(tx as any, {
        accountType: 'business',
        accountId: po.businessId,
        direction: 'credit',
        amountCents: payment.netCents,
        refType: 'payment',
        refId: payment.id,
        description: `Payment ${payment.id} confirmed via ${provider} webhook`,
      });
      if (payment.feeCents > 0) {
        writeLedgerEntry(tx as any, {
          accountType: 'platform',
          accountId: 'platform',
          direction: 'credit',
          amountCents: payment.feeCents,
          refType: 'fee',
          refId: payment.id,
          description: `Platform fee for payment ${payment.id}`,
        });
      }
    });
    // Receipt outside tx
    try {
      await generateReceiptForPayment(env.DB, { ...payment, status: 'confirmed' } as any);
    } catch (e) {
      // already handled in route, but log for ops
      await recordAudit(env.DB, {
        actorUserId: null,
        action: 'invoice.generate.failed',
        resourceType: 'purchase_order',
        resourceId: po.id,
        metadata: { paymentId: payment.id, error: String(e) },
      });
    }
    // Notify both buyer (payment received) and supplier (funds incoming).
    try {
      await notifyOrderParties(
        env.DB,
        env.NOTIFICATIONS_QUEUE,
        { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
        {
          type: NotificationType.PAYMENT_RECEIVED,
          title: `Payment received for PO ${po.poNumber}`,
          body: `Buyer confirmed payment via ${provider}.`,
          link: `/orders/${po.id}`,
          audience: 'both',
        },
      );
    } catch (err) {
      console.error('[payhere.webhook] payment.received notify failed', err);
    }
  } else if (event.type === 'payment.failed' || event.type === 'payment.cancelled') {
    const now = Date.now();
    db.update(paymentsTable)
      .set({
        status: 'failed',
        statusReason: `gateway:${event.type}`,
        updatedAt: now,
      })
      .where(eq(paymentsTable.id, payment.id))
      .run();
    // Notify buyer so they can retry.
    try {
      await notifyOrderParties(
        env.DB,
        env.NOTIFICATIONS_QUEUE,
        { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
        {
          type: NotificationType.PAYMENT_FAILED,
          title: `Payment failed for PO ${po.poNumber}`,
          body: `Gateway reported ${event.type}. Please retry.`,
          link: `/orders/${po.id}`,
          audience: 'buyer',
        },
      );
    } catch (err) {
      console.error('[payhere.webhook] payment.failed notify failed', err);
    }
  }

  await recordAudit(env.DB, {
    actorUserId: null,
    action: `webhook.payment.${event.type}`,
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { provider, gatewayRef: event.gatewayRef, statusCode: event.statusCode },
  });

  return c.json({ ok: true });
});

export default router;
