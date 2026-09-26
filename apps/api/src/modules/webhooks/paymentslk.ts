import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { txBatch } from '../../lib/txBatch';
import {
  payments as paymentsTable,
  purchaseOrders,
  paymentEvents,
  chargebacks,
} from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { resolveGateway, md5, type WebhookEvent, type GatewayProvider } from '@vyro/payments';
import { newId, NotificationType, TRUST_SEAL_TERM_MS } from '@vyro/shared';
import { writeLedgerEntry } from '../ledger';
import { generateReceiptForPayment } from '../invoices/generate';
import { recordAudit } from '../supplierProducts/repository';
import { httpError } from '../../lib/errors';
import { notifyOrderParties } from '../notifications/dispatcher';

const router = new Hono<{ Bindings: Env }>();

/**
 * payments.lk webhook endpoint. Body is JSON, signed with
 * `Payments-Signature: t=<unix>,v1=<hex>` (HMAC-SHA256 over `t + "." + rawBody`,
 * 300s tolerance). Public — no session auth; cryptographic verification +
 * amount/currency binding + payment_events dedupe instead. CSRF-exempt
 * (middleware/verifyCsrf EXEMPT_EXACT).
 *
 * The raw body text is verified byte-exactly — never parse-then-verify.
 * Idempotency: status guard (only `pending` transitions) + `payment_events`
 * unique on (payment_id, status_code, provider_payment_id). Duplicate
 * deliveries ack without side effects.
 */
async function handlePaymentsLkWebhook(c: Context<{ Bindings: Env }>) {
  const raw = await c.req.text();
  const env = c.env as Env;
  const signature = c.req.header('payments-signature') ?? null;
  const { adapter, provider } = resolveGateway(env);

  await recordAudit(env.DB, {
    actorUserId: null,
    action: 'PAYMENT_NOTIFICATION_RECEIVED',
    resourceType: 'payment',
    resourceId: 'unknown',
    metadata: { provider, bytes: raw.length },
  });

  if (!adapter.verifySignature(raw, signature)) {
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_VERIFICATION_FAILED',
      resourceType: 'payment',
      resourceId: 'unknown',
      metadata: { provider, reason: 'bad-payments-signature' },
    });
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid webhook signature');
  }

  let event: WebhookEvent;
  try {
    event = await adapter.parseWebhook(raw, signature);
  } catch {
    // Signature verified but body unparseable → ack 400, nothing stored.
    throw httpError(400, 'VALIDATION_ERROR', 'Malformed webhook payload');
  }

  if (event.type === 'unknown') {
    // Forward compatible: vendor may add event types; ack and ignore.
    return c.json({ ok: true, ignored: (event.raw as any)?.type ?? 'unknown' });
  }

  return c.json(await applyGatewayPaymentEvent(env, event, provider));
}

/**
 * Shared processor: applies one verified payments.lk event to VYRO money
 * state. Exported so the checkout-status poll and saved-card charge paths
 * reuse the exact same idempotent pipeline as the webhook.
 */
export async function applyGatewayPaymentEvent(
  env: Env,
  event: WebhookEvent,
  provider: GatewayProvider = 'payments_lk',
): Promise<{ ok: true; ignored?: string; alreadyProcessed?: boolean; trustSeal?: string; refund?: string; card?: string }> {
  const db = getDb(env.DB);

  // TrustSEAL: reference like ts_* maps to trust_seal_subscriptions.payment_id.
  if (event.gatewayRef.startsWith('ts_')) {
    const { trustSealRepository } = await import('../trustSeal/repository');
    if (event.type !== 'payment.success') {
      return { ok: true, ignored: 'trustseal-non-success' };
    }
    const activated = await trustSealRepository.activateFromWebhook(env.DB, event.gatewayRef, TRUST_SEAL_TERM_MS);
    if (!activated) throw httpError(400, 'VALIDATION_ERROR', 'Unknown TrustSEAL payment');
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'TRUSTSEAL_ACTIVATED',
      resourceType: 'trust_seal_subscription',
      resourceId: activated.id,
      metadata: { provider, paymentId: event.gatewayRef },
    });
    return { ok: true, trustSeal: 'activated' };
  }

  // Refund outcomes: payments.lk reports refund.succeeded/failed with our
  // refund id + provider refund id. Routed BEFORE the pending-payment guard —
  // the parent payment is `confirmed` by definition here.
  if (event.type === 'refund.completed' || event.type === 'refund.failed') {
    const { refunds } = await import('@vyro/db/schema');
    const { finalizeRefund, failRefund } = await import('../refunds/executor');
    let refund: any = null;
    if (event.refundId) {
      refund =
        ((await db.select().from(refunds).where(eq(refunds.gatewayRefundId, event.refundId)).get()) as any) ?? null;
    }
    if (!refund && event.gatewayRef) {
      const candidates = (await db.select().from(refunds).where(eq(refunds.paymentId, event.gatewayRef)).all()) as any[];
      refund =
        candidates
          .filter((r) => r.status === 'processing')
          .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0] ?? null;
    }
    if (!refund) {
      await recordAudit(env.DB, {
        actorUserId: null,
        action: 'webhook.unknown_refund',
        resourceType: 'refund',
        resourceId: event.refundId ?? '',
        metadata: { provider, gatewayRef: event.gatewayRef },
      });
      return { ok: true, ignored: 'unknown-refund' };
    }
    if (event.type === 'refund.completed') {
      await finalizeRefund(env, refund.id, {
        gatewayRefundId: event.refundId ?? null,
        providerReference: event.paymentId ?? null,
      });
      return { ok: true, refund: 'completed' };
    }
    await failRefund(env, refund.id, 'gateway:refund.failed');
    return { ok: true, refund: 'failed' };
  }

  // Primary lookup: reference == payment.id (unique per attempt).
  // Legacy fallback: gatewayRef match for rows created before the switch.
  const byId = (await db.select().from(paymentsTable).where(eq(paymentsTable.id, event.gatewayRef)).get()) as any;
  const byRef = byId
    ? null
    : ((await db.select().from(paymentsTable).where(eq(paymentsTable.gatewayRef, event.gatewayRef)).get()) as any);
  const payment = (byId ?? byRef) as any;
  if (!payment) {
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'webhook.unknown_payment',
      resourceType: 'payment',
      resourceId: event.gatewayRef,
      metadata: { provider },
    });
    return { ok: true, ignored: 'unknown-payment' };
  }

  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get()) as any;
  if (!po) return { ok: true, ignored: 'po-missing' };

  // Amount/currency binding for payment.* events (refund/card amounts differ by design).
  if (event.type.startsWith('payment.')) {
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
  }

  // Sanitized event storage: hash of raw payload, never card fields.
  const now = Date.now();
  const payloadHash = md5(JSON.stringify(event.raw));
  const providerPaymentId = event.paymentId ?? event.refundId ?? null;
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
    return { ok: true, alreadyProcessed: true };
  }

  await recordAudit(env.DB, {
    actorUserId: null,
    action: 'PAYMENT_VERIFIED',
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { provider, gatewayRef: event.gatewayRef, eventType: event.type },
  });

  // Saved-card capture. Runs before the pending-payment guard — a card can be
  // saved from a checkout that is still pending.
  if (event.type === 'card.saved') {
    if (!event.card?.id) return { ok: true, ignored: 'card-missing-id' };
    if (!payment.businessId) return { ok: true, ignored: 'card-no-business' };
    const { savedCardsRepository } = await import('../savedCards/repository');
    await savedCardsRepository.upsert(env.DB, {
      businessId: payment.businessId,
      paymentsLkCardId: event.card.id,
      brand: event.card.brand ?? null,
      last4: event.card.last4 ?? null,
      expiryMonth: event.card.expMonth ?? null,
      expiryYear: event.card.expYear ?? null,
    });
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'SAVED_CARD_SAVED',
      resourceType: 'saved_card',
      resourceId: event.card.id,
      metadata: { provider, businessId: payment.businessId },
    });
    return { ok: true, card: 'saved' };
  }

  // Idempotent status update: only pending payments transition — except a
  // chargeback, which by definition arrives after the payment was confirmed.
  const chargebackOnPaid = event.type === 'payment.chargeback' && payment.status === 'confirmed';
  if (payment.status !== 'pending' && !chargebackOnPaid) {
    return { ok: true, alreadyProcessed: true };
  }

  if (event.type === 'payment.success') {
    await txBatch(db, async (tx) => {
      tx.update(paymentsTable)
        .set({ status: 'confirmed', confirmedAt: now, paidAt: now, providerTransactionId: providerPaymentId, updatedAt: now })
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
    // Attempt outcome: close the matching open attempt.
    await closeOpenAttempt(env, payment.id, provider, providerPaymentId, 'paid');
    // Allocation + earnings flow for online-paid money.
    try {
      const { ensureAllocationAndEarning } = await import('../finance/earnings');
      await ensureAllocationAndEarning(env.DB, payment.id, null);
    } catch (err) {
      console.error('[paymentslk.webhook] earning failed', err);
    }
    try {
      await generateReceiptForPayment(env.DB, { ...payment, status: 'confirmed' } as any);
      try {
        await notifyOrderParties(
          env.DB,
          env.NOTIFICATIONS_QUEUE,
          { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
          {
            type: NotificationType.INVOICE_AVAILABLE,
            title: `Invoice available for PO ${po.poNumber}`,
            body: 'Your payment receipt is ready.',
            link: `/invoices?poId=${po.id}`,
            audience: 'buyer',
          },
        );
      } catch (err) {
        console.error('[paymentslk.webhook] invoice-available notify failed', err);
      }
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
          body: `Buyer paid online via payments.lk.`,
          link: `/orders/${po.id}`,
          audience: 'both',
        },
      );
    } catch (err) {
      console.error('[paymentslk.webhook] payment.received notify failed', err);
    }
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_SUCCESS',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef },
    });
    return { ok: true };
  }

  if (event.type === 'payment.pending') {
    // Pending: keep payment pending, event already stored. No ledger/receipt.
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'webhook.payment.pending',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef },
    });
    return { ok: true };
  }

  if (event.type === 'payment.expired' || event.type === 'payment.cancelled') {
    const reason = `gateway:${event.type}`;
    await db
      .update(paymentsTable)
      .set({
        status: 'cancelled',
        statusReason: reason,
        cancelledAt: now,
        expiredAt: event.type === 'payment.expired' ? now : undefined,
        updatedAt: now,
      })
      .where(eq(paymentsTable.id, payment.id))
      .run();
    await closeOpenAttempt(env, payment.id, provider, providerPaymentId, 'cancelled', reason);
    try {
      await notifyOrderParties(
        env.DB,
        env.NOTIFICATIONS_QUEUE,
        { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
        {
          type: NotificationType.PAYMENT_FAILED,
          title: `Payment ${event.type === 'payment.expired' ? 'expired' : 'cancelled'} for PO ${po.poNumber}`,
          body: 'Gateway reported the checkout did not complete. You can try again.',
          link: `/orders/${po.id}`,
          audience: 'buyer',
        },
      );
    } catch (err) {
      console.error('[paymentslk.webhook] expiry notify failed', err);
    }
    await recordAudit(env.DB, {
      actorUserId: null,
      action: event.type === 'payment.expired' ? 'PAYMENT_EXPIRED' : 'PAYMENT_CANCELLED',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef },
    });
    return { ok: true };
  }

  if (event.type === 'payment.chargeback') {
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
          reason: 'payments-lk-dispute',
          status: 'open',
          createdAt: now,
        })
        .run();
    } catch {
      // Chargeback row may already exist for this payment; keep idempotent.
    }
    // Hold the supplier's settlement for this payment while the chargeback is open.
    try {
      const { recomputeEligibilityForPayment } = await import('../finance/earnings');
      await recomputeEligibilityForPayment(env.DB, payment.id);
    } catch (err) {
      console.error('[paymentslk.webhook] chargeback eligibility recompute failed', err);
    }
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_CHARGEBACK',
      resourceType: 'payment',
      resourceId: payment.id,
      metadata: { provider, gatewayRef: event.gatewayRef },
    });
    return { ok: true };
  }

  // payment.failed and any other failure mapping.
  const reason = `gateway:${event.type}`;
  await db
    .update(paymentsTable)
    .set({ status: 'failed', statusReason: reason, failedAt: now, updatedAt: now })
    .where(eq(paymentsTable.id, payment.id))
    .run();
  await closeOpenAttempt(env, payment.id, provider, providerPaymentId, 'failed', reason);
  try {
    await notifyOrderParties(
      env.DB,
      env.NOTIFICATIONS_QUEUE,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type: NotificationType.PAYMENT_FAILED,
        title: `Payment failed for PO ${po.poNumber}`,
        body: 'The payment was not completed. Please retry.',
        link: `/orders/${po.id}`,
        audience: 'buyer',
      },
    );
  } catch (err) {
    console.error('[paymentslk.webhook] failure notify failed', err);
  }
  await recordAudit(env.DB, {
    actorUserId: null,
    action: 'PAYMENT_FAILED',
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { provider, gatewayRef: event.gatewayRef },
  });
  return { ok: true };
}

/** Attempt outcome: close the matching open attempt (or synthesize one). */
async function closeOpenAttempt(
  env: Env,
  paymentId: string,
  provider: GatewayProvider,
  providerPaymentId: string | null,
  outcome: 'paid' | 'failed' | 'cancelled',
  failureReason?: string,
): Promise<void> {
  try {
    const { listAttempts, completeAttempt, recordAttempt } = await import('../finance/repository');
    const attempts = await listAttempts(env.DB, paymentId);
    const open = [...attempts].reverse().find((a: any) => ['initiated', 'processing'].includes(a.status));
    if (open) {
      await completeAttempt(env.DB, open.id, outcome, {
        providerReference: providerPaymentId,
        failureReason: failureReason ?? null,
      });
      return;
    }
    const { payments } = await import('@vyro/db/schema');
    const payment = (await getDb(env.DB).select().from(payments).where(eq(payments.id, paymentId)).get()) as any;
    if (!payment) return;
    const created = await recordAttempt(env.DB, {
      paymentId,
      provider,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: 'processing',
      providerReference: providerPaymentId,
      initiatedAt: Date.now(),
    });
    await completeAttempt(env.DB, created.id, outcome, {
      providerReference: providerPaymentId,
      failureReason: failureReason ?? null,
    });
  } catch (err) {
    console.error('[paymentslk.webhook] attempt tracking failed', err);
  }
}

router.post('/payments-lk', handlePaymentsLkWebhook);
router.post('/plk-notify', handlePaymentsLkWebhook);

export default router;
