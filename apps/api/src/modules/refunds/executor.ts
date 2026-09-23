import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { payments, purchaseOrders, refunds, type Payment, type Refund } from '@vyro/db/schema';
import { newId, NotificationType, formatLKR } from '@vyro/shared';
import { resolveGateway } from '@vyro/payments';
import { httpError } from '../../lib/errors';
import { writeLedgerEntry } from '../ledger/writer';
import { notifyOrderParties } from '../notifications/dispatcher';
import { recordAudit } from '../supplierProducts/repository';
import type { Env } from '../../env';

/**
 * The single place refunds are created and settled. Every refund path —
 * cancellation, partial accept, returns, dispute resolution, buyer request,
 * admin approval, gateway webhook — goes through here so money moves exactly
 * once and the payment/earning/ledger projections stay consistent.
 */

export type RefundSource = 'cancel' | 'reject' | 'partial_accept' | 'return' | 'dispute' | 'manual';

export interface ExecuteRefundInput {
  paymentId: string;
  /** Omit to refund everything still refundable. */
  amountCents?: number;
  source: RefundSource;
  sourceRefId?: string | null;
  reason?: string | null;
  actorUserId: string | null;
  /** Deterministic key so retries (cron, double-click) never double-refund. */
  idempotencyKey: string;
  /**
   * auto  = online payments go straight to the gateway; offline ones queue.
   * queue = always create a `requested` refund for admin approval.
   */
  mode?: 'auto' | 'queue';
}

export interface RefundOutcome {
  refundId: string;
  status: Refund['status'];
  amountCents: number;
  reused: boolean;
}

const PENDING = ['requested', 'approved', 'processing'] as const;

type RefundEnv = Pick<Env, 'DB'> & Partial<Env>;

async function loadPayment(d1: D1Database, id: string): Promise<Payment | null> {
  return ((await getDb(d1).select().from(payments).where(eq(payments.id, id)).get()) as Payment | undefined) ?? null;
}

/** Amount still refundable on a payment (gross − completed − in-flight). */
export async function refundableCents(d1: D1Database, payment: Pick<Payment, 'id' | 'amountCents'>): Promise<number> {
  const row = (await getDb(d1)
    .select({ sum: sql<number>`COALESCE(SUM(amount_cents), 0)` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, payment.id), inArray(refunds.status, ['completed', ...PENDING])))
    .get()) as { sum: number } | undefined;
  return Math.max(0, payment.amountCents - Number(row?.sum ?? 0));
}

function feeShare(payment: Pick<Payment, 'amountCents' | 'feeCents'>, amountCents: number): number {
  if (payment.feeCents <= 0 || payment.amountCents <= 0) return 0;
  return Math.min(payment.feeCents, Math.round((amountCents * payment.feeCents) / payment.amountCents));
}

/**
 * Create (and, for online payments, immediately process) a refund.
 * Returns null when nothing is refundable.
 */
export async function executeRefund(env: RefundEnv, input: ExecuteRefundInput): Promise<RefundOutcome | null> {
  const d1 = env.DB;
  const db = getDb(d1);

  const existing = (await db.select().from(refunds).where(eq(refunds.idempotencyKey, input.idempotencyKey)).get()) as
    | Refund
    | undefined;
  if (existing) {
    return { refundId: existing.id, status: existing.status, amountCents: existing.amountCents, reused: true };
  }

  const payment = await loadPayment(d1, input.paymentId);
  if (!payment) throw httpError(404, 'NOT_FOUND', 'Payment not found');
  if (payment.status !== 'confirmed') {
    throw httpError(409, 'CONFLICT', `Only confirmed payments can be refunded (current: ${payment.status})`);
  }
  const available = await refundableCents(d1, payment);
  const amount = Math.min(input.amountCents ?? available, available);
  if (input.amountCents !== undefined && input.amountCents > available) {
    throw httpError(400, 'VALIDATION_ERROR', `Refund amount exceeds refundable (${available})`);
  }
  if (amount <= 0) return null;

  const now = Date.now();
  const id = newId();
  const online = payment.method === 'online' && !!payment.gatewayRef;
  const auto = (input.mode ?? 'auto') === 'auto' && online;
  try {
    await db
      .insert(refunds)
      .values({
        id,
        paymentId: payment.id,
        purchaseOrderId: payment.purchaseOrderId,
        amountCents: amount,
        currency: payment.currency,
        reason: input.reason ?? null,
        status: auto ? 'processing' : 'requested',
        initiatorType: input.actorUserId ? 'user' : 'system',
        refundMethod: online ? 'gateway' : payment.method,
        idempotencyKey: input.idempotencyKey,
        feeRefundCents: feeShare(payment, amount),
        source: input.source,
        sourceRefId: input.sourceRefId ?? null,
        requestedByUserId: input.actorUserId ?? (await orderCreatorId(d1, payment.purchaseOrderId)),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (err) {
    // Lost a race on the idempotency key — return the winner.
    const winner = (await db.select().from(refunds).where(eq(refunds.idempotencyKey, input.idempotencyKey)).get()) as
      | Refund
      | undefined;
    if (winner) return { refundId: winner.id, status: winner.status, amountCents: winner.amountCents, reused: true };
    throw err;
  }

  await recordAudit(d1, {
    actorUserId: input.actorUserId,
    action: 'refund.create',
    resourceType: 'purchase_order',
    resourceId: payment.purchaseOrderId,
    metadata: { refundId: id, paymentId: payment.id, amountCents: amount, source: input.source, mode: auto ? 'gateway' : 'queued' },
  }).catch(() => undefined);

  if (!auto) {
    await notifyRefund(env, payment.purchaseOrderId, 'requested', amount, input.actorUserId);
    return { refundId: id, status: 'requested', amountCents: amount, reused: false };
  }
  const status = await processViaGateway(env, id);
  return { refundId: id, status, amountCents: amount, reused: false };
}

/** Sends a `processing` refund to the gateway and settles it per the result. */
export async function processViaGateway(env: RefundEnv, refundId: string): Promise<Refund['status']> {
  const d1 = env.DB;
  const db = getDb(d1);
  const refund = (await db.select().from(refunds).where(eq(refunds.id, refundId)).get()) as Refund | undefined;
  if (!refund) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  const payment = await loadPayment(d1, refund.paymentId);
  if (!payment?.gatewayRef) return failRefund(env, refundId, 'payment has no gateway reference');
  try {
    const { adapter } = resolveGateway(env as Env);
    const result = await adapter.refund({
      paymentGatewayRef: payment.gatewayRef,
      refundId: refund.id,
      amountCents: refund.amountCents,
      reason: refund.reason ?? '',
    });
    if (result.status === 'completed') {
      await finalizeRefund(env, refundId, { gatewayRefundId: result.gatewayRefundId ?? null });
      return 'completed';
    }
    if (result.status === 'failed') return failRefund(env, refundId, 'gateway refused refund');
    // pending: the gateway webhook will finalize.
    await db.update(refunds).set({ status: 'processing', updatedAt: Date.now() }).where(eq(refunds.id, refundId)).run();
    return 'processing';
  } catch (err) {
    return failRefund(env, refundId, String(err).slice(0, 300));
  }
}

/**
 * Ops approved a queued refund: online payments go to the gateway, offline
 * ones are finalized (ops attests the cash / transfer was returned).
 */
export async function settleApprovedRefund(env: RefundEnv, refundId: string, actorUserId: string): Promise<Refund['status']> {
  const db = getDb(env.DB);
  const refund = (await db.select().from(refunds).where(eq(refunds.id, refundId)).get()) as Refund | undefined;
  if (!refund) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  const payment = await loadPayment(env.DB, refund.paymentId);
  await db
    .update(refunds)
    .set({ approvedByUserId: actorUserId, approvedAt: Date.now(), updatedAt: Date.now() })
    .where(eq(refunds.id, refundId))
    .run();
  if (payment?.method === 'online' && payment.gatewayRef) {
    await db.update(refunds).set({ status: 'processing', updatedAt: Date.now() }).where(eq(refunds.id, refundId)).run();
    return processViaGateway(env, refundId);
  }
  await finalizeRefund(env, refundId, { actorUserId });
  return 'completed';
}

/** Marks a refund failed. The payment stays `confirmed` — money never moved. */
export async function failRefund(env: RefundEnv, refundId: string, reason: string): Promise<'failed'> {
  const db = getDb(env.DB);
  const now = Date.now();
  await db
    .update(refunds)
    .set({ status: 'failed', failureReason: reason, processedAt: now, updatedAt: now })
    .where(and(eq(refunds.id, refundId), inArray(refunds.status, [...PENDING])))
    .run();
  const refund = (await db.select().from(refunds).where(eq(refunds.id, refundId)).get()) as Refund | undefined;
  if (refund?.purchaseOrderId) {
    await recomputeForPayment(env.DB, refund.paymentId);
    await notifyRefund(env, refund.purchaseOrderId, 'failed', refund.amountCents, null);
  }
  return 'failed';
}

/**
 * Settles a refund: ledger reversal, payment status, earning adjustment,
 * settlement eligibility, notifications. Idempotent — the conditional UPDATE
 * means only the first caller performs the side effects.
 */
export async function finalizeRefund(
  env: RefundEnv,
  refundId: string,
  opts: { gatewayRefundId?: string | null; actorUserId?: string | null; providerReference?: string | null } = {},
): Promise<boolean> {
  const d1 = env.DB;
  const db = getDb(d1);
  const now = Date.now();
  const claim = await db
    .update(refunds)
    .set({
      status: 'completed',
      gatewayRefundId: opts.gatewayRefundId ?? undefined,
      processedAt: now,
      completedAt: now,
      approvedByUserId: opts.actorUserId ?? undefined,
      updatedAt: now,
    })
    .where(and(eq(refunds.id, refundId), inArray(refunds.status, [...PENDING])))
    .run();
  if (changesOf(claim) === 0) return false;

  const refund = (await db.select().from(refunds).where(eq(refunds.id, refundId)).get()) as Refund;
  const payment = (await loadPayment(d1, refund.paymentId))!;
  const po = await db
    .select({ id: purchaseOrders.id, businessId: purchaseOrders.businessId, supplierId: purchaseOrders.supplierId })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, payment.purchaseOrderId))
    .get();

  // Refund accounting (finance spec §20): reverse the business credit, reverse
  // the platform fee pro-rata, shrink the supplier earning by the refunded
  // amount and record the supplier-side adjustment.
  let fee = refund.feeRefundCents ?? 0;
  if (fee === 0 && payment.feeCents > 0) {
    fee = feeShare(payment, refund.amountCents);
    await db.update(refunds).set({ feeRefundCents: fee }).where(eq(refunds.id, refund.id)).run();
  }
  if (opts.providerReference) {
    await db.update(refunds).set({ providerReference: opts.providerReference }).where(eq(refunds.id, refund.id)).run();
  }
  if (po) {
    await writeLedgerEntry(db, {
      accountType: 'business',
      accountId: po.businessId,
      direction: 'debit',
      amountCents: refund.amountCents,
      currency: refund.currency,
      refType: 'refund',
      refId: refund.id,
      category: 'REFUND',
      entityType: 'payment',
      entityId: payment.id,
      description: `Refund ${refund.refundNumber ?? refund.id} (${refund.source ?? 'manual'}) for payment ${payment.id}`,
      createdByUserId: opts.actorUserId ?? null,
    });
  }
  if (fee > 0) {
    await writeLedgerEntry(db, {
      accountType: 'platform',
      accountId: 'platform',
      direction: 'debit',
      amountCents: fee,
      currency: refund.currency,
      refType: 'refund',
      refId: refund.id,
      category: 'REFUND_ADJUSTMENT',
      entityType: 'payment',
      entityId: payment.id,
      description: `Platform fee reversal for refund ${refund.id}`,
      createdByUserId: opts.actorUserId ?? null,
    });
  }

  const doneRow = (await db
    .select({ sum: sql<number>`COALESCE(SUM(amount_cents), 0)` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, payment.id), eq(refunds.status, 'completed')))
    .get()) as { sum: number } | undefined;
  const refundedTotal = Number(doneRow?.sum ?? 0);
  if (refundedTotal >= payment.amountCents) {
    await db
      .update(payments)
      .set({ status: 'refunded', statusReason: refund.reason ?? 'refunded', updatedAt: now })
      .where(eq(payments.id, payment.id))
      .run();
  }

  if (po) {
    try {
      const { applyEarningRefundDelta } = await import('../finance/repository');
      const updated = await applyEarningRefundDelta(d1, payment.id, po.supplierId, refund.amountCents);
      if (updated) {
        await writeLedgerEntry(db, {
          accountType: 'supplier',
          accountId: po.supplierId,
          direction: 'debit',
          amountCents: refund.amountCents,
          currency: refund.currency,
          refType: 'refund',
          refId: refund.id,
          category: 'REFUND_ADJUSTMENT',
          entityType: 'supplier_earning',
          entityId: updated.id,
          description: `Supplier earnings adjustment for refund ${refund.id}`,
          createdByUserId: opts.actorUserId ?? null,
        });
      }
    } catch (err) {
      console.error('[refunds.executor] earning adjustment failed', { refundId, err });
    }
  }

  await recomputeForPayment(d1, payment.id);
  if (po) await notifyRefund(env, po.id, 'completed', refund.amountCents, opts.actorUserId ?? null);
  return true;
}

async function recomputeForPayment(d1: D1Database, paymentId: string): Promise<void> {
  try {
    const { recomputeEligibilityForPayment } = await import('../finance/earnings');
    await recomputeEligibilityForPayment(d1, paymentId);
  } catch (err) {
    console.error('[refunds.executor] eligibility recompute failed', { paymentId, err });
  }
}

/** Refunds every confirmed payment on an order (cancellation / full dispute refund). */
export async function refundAllForOrder(
  env: RefundEnv,
  args: { poId: string; source: RefundSource; reason: string | null; actorUserId: string | null; keyPrefix: string },
): Promise<RefundOutcome[]> {
  const db = getDb(env.DB);
  const pays = (await db.select().from(payments).where(eq(payments.purchaseOrderId, args.poId)).all()) as Payment[];
  const out: RefundOutcome[] = [];
  for (const p of pays.filter((x) => x.status === 'confirmed')) {
    const r = await executeRefund(env, {
      paymentId: p.id,
      source: args.source,
      sourceRefId: args.poId,
      reason: args.reason,
      actorUserId: args.actorUserId,
      idempotencyKey: `${args.keyPrefix}:${p.id}`,
    });
    if (r) out.push(r);
  }
  return out;
}

/**
 * Refunds `amountCents` across an order's confirmed payments (newest first).
 * Used by partial accept, returns and partial dispute outcomes.
 */
export async function refundAmountForOrder(
  env: RefundEnv,
  args: {
    poId: string;
    amountCents: number;
    source: RefundSource;
    sourceRefId?: string | null;
    reason: string | null;
    actorUserId: string | null;
    keyPrefix: string;
  },
): Promise<{ refunds: RefundOutcome[]; unrefundedCents: number }> {
  const db = getDb(env.DB);
  const pays = ((await db.select().from(payments).where(eq(payments.purchaseOrderId, args.poId)).all()) as Payment[])
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => (b.confirmedAt ?? b.createdAt) - (a.confirmedAt ?? a.createdAt));
  let remaining = args.amountCents;
  const out: RefundOutcome[] = [];
  for (const p of pays) {
    if (remaining <= 0) break;
    const avail = await refundableCents(env.DB, p);
    const take = Math.min(avail, remaining);
    if (take <= 0) continue;
    const r = await executeRefund(env, {
      paymentId: p.id,
      amountCents: take,
      source: args.source,
      sourceRefId: args.sourceRefId ?? args.poId,
      reason: args.reason,
      actorUserId: args.actorUserId,
      idempotencyKey: `${args.keyPrefix}:${p.id}`,
    });
    if (r) {
      out.push(r);
      remaining -= r.amountCents;
    }
  }
  return { refunds: out, unrefundedCents: Math.max(0, remaining) };
}

async function notifyRefund(
  env: RefundEnv,
  poId: string,
  kind: 'requested' | 'completed' | 'failed',
  amountCents: number,
  actorUserId: string | null,
): Promise<void> {
  try {
    const db = getDb(env.DB);
    const po = await db
      .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, businessId: purchaseOrders.businessId, supplierId: purchaseOrders.supplierId })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .get();
    if (!po) return;
    const amt = formatLKR(amountCents);
    const copy =
      kind === 'completed'
        ? { type: NotificationType.REFUND_COMPLETED, title: `Refund completed for ${po.poNumber}`, body: `${amt} has been refunded.` }
        : kind === 'failed'
          ? { type: NotificationType.REFUND_FAILED, title: `Refund failed for ${po.poNumber}`, body: `A refund of ${amt} could not be processed. Our team will follow up.` }
          : { type: NotificationType.REFUND_INITIATED, title: `Refund requested for ${po.poNumber}`, body: `A refund of ${amt} is awaiting processing.` };
    await notifyOrderParties(env.DB, env.NOTIFICATIONS_QUEUE, po, {
      ...copy,
      link: `/orders/${po.id}`,
      audience: 'both',
      excludeUserId: actorUserId,
    });
  } catch (err) {
    console.error('[refunds.executor] notify failed', err);
  }
}

async function orderCreatorId(d1: D1Database, poId: string): Promise<string> {
  // refunds.requested_by_user_id is NOT NULL + FK: system-initiated refunds
  // (cron auto-cancel, supplier cancel) are attributed to the buyer who placed the order.
  const row = await getDb(d1)
    .select({ id: purchaseOrders.createdByUserId })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId))
    .get();
  if (!row) throw new Error('order not found for refund attribution');
  return row.id;
}

function changesOf(result: unknown): number {
  const r = result as { meta?: { changes?: number }; changes?: number; rowsAffected?: number } | undefined;
  return Number(r?.meta?.changes ?? r?.changes ?? r?.rowsAffected ?? 0);
}
