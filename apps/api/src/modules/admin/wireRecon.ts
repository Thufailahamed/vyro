import { purchaseOrders, fxSnapshots } from '@vyro/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { httpError } from '../../lib/errors';
import { convertCents, snapshotRate } from '../cross-border/fx';
import { logger } from '../../lib/logger';
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
      status: 'paid',
      updatedAt: Date.now(),
    })
    .where(eq(purchaseOrders.id, input.orderId));

  await recordAudit(env.DB, {
    actorUserId: input.adminUserId,
    action: 'cross_border.wire_received',
    resourceType: 'purchase_order',
    resourceId: input.orderId,
    metadata: { wireRef: input.wireRef, receivedLkrCents, deltaBps, ack: !!input.acknowledgeMismatch },
  });
  logger.info('cross_border.wire_received', { orderId: input.orderId, deltaBps });
  return { status: 'paid', deltaBps };
}