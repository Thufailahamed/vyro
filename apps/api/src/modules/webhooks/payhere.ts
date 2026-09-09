import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import {
  payments as paymentsTable,
  purchaseOrders,
  paymentEvents,
  chargebacks,
} from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { resolveGateway, md5 } from '@vyro/payments';
import { newId } from '@vyro/shared';
import { writeLedgerEntry } from '../ledger';
import { generateReceiptForPayment } from '../invoices/generate';
import { recordAudit } from '../supplierProducts/repository';
import { httpError } from '../../lib/errors';
import { notifyOrderParties } from '../notifications/dispatcher';
import { NotificationType } from '@vyro/shared';

const router = new Hono<{ Bindings: Env }>();

/**
 * PayHere notify_url endpoint. Body is `application/x-www-form-urlencoded`.
 * Signature is verified by the adapter against the raw body using the official
 * double-md5 formula. Public (PayHere server calls it) — no session auth;
 * cryptographic verification + merchant/amount/currency/relationship checks
 * instead. CSRF-exempt (see middleware/verifyCsrf EXEMPT_EXACT).
 *
 * Idempotency: status guard (only `pending` transitions) + `payment_events`
 * unique on (payment_id, status_code, provider_payment_id). Duplicate
 * notifications ack without side effects.
 */
async function handlePayHereNotify(c: Context<{ Bindings: Env }>) {
  const raw = await c.req.text();
  const env = c.env as Env;
  const { adapter, provider } = resolveGateway(env);

  await recordAudit(env.DB, {
    actorUserId: null,
    action: 'PAYMENT_NOTIFICATION_RECEIVED',
    resourceType: 'payment',
    resourceId: 'unknown',
    metadata: { provider, bytes: raw.length },
  });

  if (!adapter.verifySignature(raw, null)) {
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_VERIFICATION_FAILED',
      resourceType: 'payment',
      resourceId: 'unknown',
      metadata: { provider, reason: 'bad-md5sig' },
    });
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid webhook signature');
  }

  const event = await adapter.parseWebhook(raw, null);
  const params = new URLSearchParams(raw);
  const merchantId = params.get('merchant_id') ?? '';

  // Merchant binding: reject notifications for a different merchant account.
  if (
    provider === 'payhere' &&
    env.PAYHERE_MERCHANT_ID &&
    merchantId !== env.PAYHERE_MERCHANT_ID
  ) {
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_VERIFICATION_FAILED',
      resourceType: 'payment',
      resourceId: event.gatewayRef,
      metadata: { provider, reason: 'merchant-mismatch' },
    });
    throw httpError(400, 'VALIDATION_ERROR', 'Unknown merchant');
  }

  const db = getDb(env.DB);
  // Primary lookup: order_id == payment.id (unique per attempt, Task 2).
  // Legacy fallback: gatewayRef match for rows created before the switch.
  const byId = (await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, event.gatewayRef))
    .get()) as any;
  const byRef = byId
    ? null
    : ((await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.gatewayRef, event.gatewayRef))
        .get()) as any);
  const payment = (byId ?? byRef) as any;
  if (!payment) {
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'webhook.unknown_payment',
      resourceType: 'payment',
      resourceId: event.gatewayRef,
      metadata: { provider },
    });
    return c.json({ ok: true, ignored: true });
  }

  const po = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, payment.purchaseOrderId))
    .get()) as any;
  if (!po) {
    return c.json({ ok: true, ignored: 'po-missing' });
  }

  // Amount/currency binding against the authoritative VYRO payment row.
  if (event.amountCents != null && event.amountCents !== payment.amountCents) {
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_VERIFICATION_FAILED',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { expected: payment.amountCents, got: event.amountCents, provider },
    });
    throw httpError(400, 'VALIDATION_ERROR', 'Webhook amount mismatch');
  }
  if (event.currency && payment.currency && event.currency !== payment.currency) {
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_VERIFICATION_FAILED',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { expected: payment.currency, got: event.currency, provider },
    });
    throw httpError(400, 'VALIDATION_ERROR', 'Webhook currency mismatch');
  }

  // Sanitized event storage: hash of raw body, never card fields.
  const now = Date.now();
  const payloadHash = md5(raw);
  const providerPaymentId = event.paymentId ?? null;
  try {
    await db
      .insert(paymentEvents)
      .values({
        id: newId(),
        paymentId: payment.id,
        provider,
        eventType: event.type,
        providerPaymentId,
        statusCode: event.statusCode ?? null,
        payloadHash,
        receivedAt: now,
        processedAt: null,
        processingStatus: 'received',
      })
      .run();
  } catch {
    // Unique violation => duplicate delivery already recorded.
    return c.json({ ok: true, alreadyProcessed: true });
  }

  await recordAudit(env.DB, {
    actorUserId: null,
    action: 'PAYMENT_VERIFIED',
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { provider, gatewayRef: event.gatewayRef, statusCode: event.statusCode },
  });

  // Idempotent status update: only pending payments transition.
  if (payment.status !== 'pending') {
    return c.json({ ok: true, alreadyProcessed: true });
  }

  if (event.type === 'payment.success') {
    await db.transaction(async (tx) => {
      tx.update(paymentsTable)
        .set({ status: 'confirmed', confirmedAt: now, paidAt: now, updatedAt: now })
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
    try {
      await generateReceiptForPayment(env.DB, { ...payment, status: 'confirmed' } as any);
    } catch (e) {
      await recordAudit(env.DB, {
        actorUserId: null,
        action: 'invoice.generate.failed',
        resourceType: 'purchase_order',
        resourceId: po.id,
        metadata: { paymentId: payment.id, error: String(e) },
      });
    }
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
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_SUCCESS',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef, statusCode: event.statusCode },
    });
  } else if (event.type === 'payment.pending') {
    // Pending: keep payment pending, event already stored. No ledger/receipt.
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'webhook.payment.payment.pending',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef, statusCode: event.statusCode },
    });
  } else if (event.type === 'payment.cancelled') {
    await db
      .update(paymentsTable)
      .set({ status: 'cancelled', statusReason: 'gateway:payment.cancelled', updatedAt: now })
      .where(eq(paymentsTable.id, payment.id))
      .run();
    try {
      await notifyOrderParties(
        env.DB,
        env.NOTIFICATIONS_QUEUE,
        { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
        {
          type: NotificationType.PAYMENT_FAILED,
          title: `Payment cancelled for PO ${po.poNumber}`,
          body: 'Gateway reported cancellation. You can try again.',
          link: `/orders/${po.id}`,
          audience: 'buyer',
        },
      );
    } catch (err) {
      console.error('[payhere.webhook] payment.cancelled notify failed', err);
    }
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_CANCELLED',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef, statusCode: event.statusCode },
    });
  } else if (event.type === 'payment.chargeback') {
    await db
      .update(paymentsTable)
      .set({ status: 'chargeback', statusReason: 'gateway:payment.chargeback', updatedAt: now })
      .where(eq(paymentsTable.id, payment.id))
      .run();
    try {
      await db
        .insert(chargebacks)
        .values({
          id: newId(),
          paymentId: payment.id,
          reason: 'payhere-status-minus-3',
          status: 'open',
          createdAt: now,
        })
        .run();
    } catch {
      // Chargeback row may already exist for this payment; keep idempotent.
    }
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_CHARGEBACK',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef, statusCode: event.statusCode },
    });
  } else {
    // payment.failed and any unknown failure mapping.
    await db
      .update(paymentsTable)
      .set({ status: 'failed', statusReason: `gateway:${event.type}`, updatedAt: now })
      .where(eq(paymentsTable.id, payment.id))
      .run();
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
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_FAILED',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef, statusCode: event.statusCode },
    });
  }

  return c.json({ ok: true });
}

router.post('/payhere', handlePayHereNotify);
router.post('/notify', handlePayHereNotify);

export default router;
