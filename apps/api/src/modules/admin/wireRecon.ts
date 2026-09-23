import { purchaseOrders, fxSnapshots, payments } from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import { writeLedgerEntry } from '../ledger/writer';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { httpError } from '../../lib/errors';
import { convertCents, snapshotRate } from '../cross-border/fx';
import { logger } from '../../lib/logger';
import { metric } from '../../lib/metrics';
import { recordAudit } from '../supplierProducts/repository';
import type { Env } from '../../env';

const MISMATCH_BPS = 100; // 1%

export interface WireReceivedInput {
  orderId: string;
  wireRef: string;
  receivedAmountCents: number;
  receivedCurrency: string;
  receivedAt?: number | undefined;
  acknowledgeMismatch?: boolean | undefined;
  adminUserId: string;
}

export async function handleWireReceived(env: Env, input: WireReceivedInput): Promise<{ status: string; deltaBps: number }> {
  const db = getDb(env.DB);
  const [order] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, input.orderId))
    .limit(1);
  if (!order) throw httpError(404, 'NOT_FOUND', 'Order not found');
  if (order.direction === 'domestic') throw httpError(400, 'VALIDATION_ERROR', 'Order is domestic');

  const receivedAt = input.receivedAt ?? Date.now();
  const snap = await snapshotRate(input.receivedCurrency, 'LKR', db, env);
  const receivedLkrCents = await convertCents(
    input.receivedAmountCents,
    input.receivedCurrency,
    'LKR',
    snap.rateScaled,
  );

  const orderTotalLkrCents = order.totalCents;
  const deltaBps = Math.round(((receivedLkrCents - orderTotalLkrCents) / orderTotalLkrCents) * 10000);
  if (Math.abs(deltaBps) > MISMATCH_BPS && !input.acknowledgeMismatch) {
    metric(env, 'cross_border.wire_mismatch', 1, { currency: input.receivedCurrency, delta_bps_bucket: bucketBps(deltaBps) });
    throw httpError(422, 'WIRE_RECONCILIATION_MISMATCH', `Delta ${(deltaBps / 100).toFixed(2)}% exceeds 1%`);
  }

  await db
    .update(purchaseOrders)
    .set({
      wireRef: input.wireRef,
      wireReceivedAmountCents: input.receivedAmountCents,
      wireReceivedCurrency: input.receivedCurrency,
      wireReceivedAt: receivedAt,
      wireReceivedBy: input.adminUserId,
      // Order status is untouched: `paid` is a payment state, not an order
      // state. Money is recorded as a confirmed payment below.
      updatedAt: Date.now(),
    })
    .where(eq(purchaseOrders.id, input.orderId));

  // Record the wire as a confirmed payment (idempotent per wire reference) so
  // the payment summary, payment gate, earnings and refunds all see it.
  const idempotencyKey = `wire:${input.orderId}:${input.wireRef}`;
  const existing = await db.select({ id: payments.id }).from(payments).where(eq(payments.idempotencyKey, idempotencyKey)).get();
  if (!existing) {
    const paymentId = newId();
    const now = Date.now();
    // Record what actually arrived (LKR equivalent); an acknowledged shortfall
    // shows up as `partially_paid` in the payment summary.
    const amount = receivedLkrCents;
    await db
      .insert(payments)
      .values({
        id: paymentId,
        purchaseOrderId: order.id,
        businessId: order.businessId,
        supplierId: order.supplierId,
        method: 'bank_transfer',
        provider: 'wire',
        status: 'confirmed',
        amountCents: amount,
        feeCents: 0,
        netCents: amount,
        currency: 'LKR',
        transactionReference: input.wireRef,
        idempotencyKey,
        paidAt: receivedAt,
        confirmedAt: now,
        confirmedByUserId: input.adminUserId,
        notes: `Wire ${input.receivedAmountCents} ${input.receivedCurrency}`,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await writeLedgerEntry(db, {
      accountType: 'business',
      accountId: order.businessId,
      direction: 'credit',
      amountCents: amount,
      refType: 'payment',
      refId: paymentId,
      description: `Wire ${input.wireRef} for PO ${order.poNumber}`,
      createdByUserId: input.adminUserId,
    });
    try {
      const { ensureAllocationAndEarning } = await import('../finance/earnings');
      await ensureAllocationAndEarning(env.DB, paymentId, input.adminUserId);
    } catch (err) {
      logger.error('cross_border.wire_earning_failed', { orderId: input.orderId, err: String(err) });
    }
  }

  await recordAudit(env.DB, {
    actorUserId: input.adminUserId,
    action: 'cross_border.wire_received',
    resourceType: 'purchase_order',
    resourceId: input.orderId,
    metadata: { wireRef: input.wireRef, receivedLkrCents, deltaBps, ack: !!input.acknowledgeMismatch },
  });
  metric(env, 'cross_border.wire_received', 1, { currency: input.receivedCurrency, ack: input.acknowledgeMismatch ? 'yes' : 'no' });
  logger.info('cross_border.wire_received', { orderId: input.orderId, deltaBps });
  return { status: 'paid', deltaBps };
}

function bucketBps(bps: number): string {
  const abs = Math.abs(bps);
  if (abs <= 100) return '0_1pct';
  if (abs <= 500) return '1_5pct';
  if (abs <= 1000) return '5_10pct';
  return 'gt_10pct';
}