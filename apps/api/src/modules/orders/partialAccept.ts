import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { codCollections, purchaseOrderItems, purchaseOrders, payments } from '@vyro/db/schema';
import { NotificationType, formatLKR, type ActorRole } from '@vyro/shared';
import type { PartialAcceptInput } from '@vyro/validation/orderLifecycle';
import { httpError } from '../../lib/errors';
import { releaseStockForLines } from '../inventory/service';
import { refundAmountForOrder, type RefundOutcome } from '../refunds/executor';
import { releaseDrawdown } from '../credit/service';
import { notifyOrderParties } from '../notifications/dispatcher';
import { applyTransition, loadPo, type LifecycleEnv } from './lifecycle';

export interface AcceptOrderInput {
  poId: string;
  actor: { role: Extract<ActorRole, 'supplier' | 'admin'>; userId: string };
  lines: PartialAcceptInput['lines'];
  note: string | null;
}

export interface AcceptOrderResult {
  status: 'accepted';
  partial: boolean;
  originalTotalCents: number;
  totalCents: number;
  reducedByCents: number;
  lines: Array<{ itemId: string; requestedQuantity: number; quantity: number; fulfilmentStatus: string }>;
  refunds: RefundOutcome[];
}

/** Line total with the snapshotted tier discount (same formula as checkout). */
export function lineTotalFor(unitCents: number, qty: number, discountPct: number): number {
  const gross = unitCents * qty;
  return discountPct > 0 ? Math.round((gross * (100 - discountPct)) / 100) : gross;
}

/**
 * Supplier acceptance with optional per-line reductions. Lines omitted from
 * `lines` are accepted in full. Order-level discounts (repeat offers) are
 * pro-rated so the buyer keeps the same effective percentage.
 *
 * Money follows the smaller order: paid orders get the difference refunded,
 * credit orders get the drawdown reduced, COD collections expect less cash.
 */
export async function acceptOrder(env: LifecycleEnv, input: AcceptOrderInput): Promise<AcceptOrderResult> {
  const d1 = env.DB;
  const db = getDb(d1);
  const po = await loadPo(d1, input.poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (po.status !== 'pending') throw httpError(409, 'CONFLICT', `Order is ${po.status}; only pending orders can be accepted`);

  const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id)).all();
  const byId = new Map(items.map((i) => [i.id, i]));
  const plan = new Map<string, { quantity: number; reason: string | null }>();
  for (const l of input.lines) {
    const item = byId.get(l.itemId);
    if (!item) throw httpError(400, 'VALIDATION_ERROR', `Unknown order line ${l.itemId}`);
    const requested = item.requestedQuantity ?? item.quantity;
    const qty = 'unavailable' in l ? 0 : l.quantity;
    if (qty > requested) {
      throw httpError(400, 'VALIDATION_ERROR', `${item.productNameSnapshot}: cannot accept more than the ${requested} ordered`);
    }
    plan.set(item.id, { quantity: qty, reason: 'unavailable' in l ? (l.reason ?? null) : null });
  }

  const originalLinesSum = items.reduce((s, i) => s + i.lineTotalCents, 0);
  let newLinesSum = 0;
  const updates: Array<{ item: (typeof items)[number]; qty: number; lineTotal: number; status: string; reason: string | null }> = [];
  for (const item of items) {
    const requested = item.requestedQuantity ?? item.quantity;
    const p = plan.get(item.id);
    const qty = p ? p.quantity : requested;
    const lineTotal =
      qty === requested ? item.lineTotalCents : lineTotalFor(item.unitPriceCentsSnapshot || item.unitPriceCents, qty, item.discountPctSnapshot);
    newLinesSum += lineTotal;
    updates.push({
      item,
      qty,
      lineTotal,
      status: qty === 0 ? 'unavailable' : qty < requested ? 'reduced' : 'accepted',
      reason: qty === 0 ? (p?.reason ?? 'unavailable') : null,
    });
  }
  if (updates.every((u) => u.qty === 0)) {
    throw httpError(422, 'NOTHING_TO_ACCEPT', 'Every line is unavailable — reject the order instead');
  }

  const partial = updates.some((u) => u.status !== 'accepted');
  const originalTotal = po.totalCents;
  // Pro-rate any order-level discount baked into subtotal (subtotal ≤ lines sum).
  const ratio = originalLinesSum > 0 ? po.subtotalCents / originalLinesSum : 1;
  const newSubtotal = partial ? Math.round(newLinesSum * ratio) : po.subtotalCents;
  const newTotal = partial ? newSubtotal + po.deliveryFeeCents : po.totalCents;
  const reducedBy = originalTotal - newTotal;

  // 1. Transition first — it is the compare-and-set that makes accept single-shot.
  await applyTransition(env, {
    poId: po.id,
    to: 'accepted',
    actor: input.actor,
    reason: input.note,
    metadata: partial
      ? {
          partial: true,
          reducedByCents: reducedBy,
          lines: updates
            .filter((u) => u.status !== 'accepted')
            .map((u) => ({ itemId: u.item.id, name: u.item.productNameSnapshot, from: u.item.requestedQuantity ?? u.item.quantity, to: u.qty })),
        }
      : null,
    opts: { expectedFrom: 'pending', via: 'accept' },
  });

  // 2. Lines + totals.
  const now = Date.now();
  for (const u of updates) {
    await db
      .update(purchaseOrderItems)
      .set({
        quantity: u.qty,
        requestedQuantity: u.item.requestedQuantity ?? u.item.quantity,
        lineTotalCents: u.lineTotal,
        fulfilmentStatus: u.status as never,
        unavailableReason: u.reason,
      })
      .where(eq(purchaseOrderItems.id, u.item.id))
      .run();
  }
  const refunds: RefundOutcome[] = [];
  if (partial) {
    await db
      .update(purchaseOrders)
      .set({
        subtotalCents: newSubtotal,
        totalCents: newTotal,
        originalTotalCents: po.originalTotalCents ?? originalTotal,
        partiallyFulfilledAt: now,
        updatedAt: now,
      })
      .where(eq(purchaseOrders.id, po.id))
      .run();

    // 3. Stock: free the units we will not ship.
    const freed = updates
      .map((u) => ({ supplierProductId: u.item.supplierProductId, quantity: u.item.quantity - u.qty }))
      .filter((l) => l.quantity > 0);
    if (po.stockReservedAt && !po.stockReleasedAt && freed.length) {
      try {
        await releaseStockForLines(d1, env.NOTIFICATIONS_QUEUE, freed, {
          purchaseOrderId: po.id,
          actorUserId: input.actor.userId,
          note: 'partial accept',
        });
      } catch (err) {
        console.error('[partialAccept] stock release failed', { poId: po.id, err });
      }
    }

    // 4. Money: follow the smaller order.
    if (reducedBy > 0) {
      try {
        const r = await refundAmountForOrder(env, {
          poId: po.id,
          amountCents: reducedBy,
          source: 'partial_accept',
          reason: 'Supplier could not fulfil the full order',
          actorUserId: input.actor.userId,
          keyPrefix: `partial_accept:${po.id}`,
        });
        refunds.push(...r.refunds);
        // Whatever was not prepaid is either credit or cash still to collect.
        const rest = r.unrefundedCents;
        if (rest > 0) {
          const released = await releaseDrawdown(d1, { poId: po.id, amountCents: rest, userId: input.actor.userId, reason: 'partial accept', now });
          if (!released) await shrinkPendingPayments(d1, po.id, newTotal, now);
        }
      } catch (err) {
        console.error('[partialAccept] money adjustment failed', { poId: po.id, err });
      }
    }

    try {
      await notifyOrderParties(
        d1,
        env.NOTIFICATIONS_QUEUE,
        { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
        {
          type: NotificationType.ORDER_PARTIALLY_ACCEPTED,
          title: `Order ${po.poNumber} partially accepted`,
          body: `The supplier can fulfil part of your order. New total ${formatLKR(newTotal)} (was ${formatLKR(originalTotal)}).${
            refunds.length ? ' The difference will be refunded.' : ''
          }`,
          audience: 'buyer',
          excludeUserId: input.actor.userId,
        },
      );
    } catch {
      /* best-effort */
    }
  }

  return {
    status: 'accepted',
    partial,
    originalTotalCents: originalTotal,
    totalCents: newTotal,
    reducedByCents: reducedBy,
    lines: updates.map((u) => ({
      itemId: u.item.id,
      requestedQuantity: u.item.requestedQuantity ?? u.item.quantity,
      quantity: u.qty,
      fulfilmentStatus: u.status,
    })),
    refunds,
  };
}

/** Pending COD / transfer intents should ask for the new, smaller amount. */
async function shrinkPendingPayments(d1: D1Database, poId: string, newTotal: number, now: number): Promise<void> {
  const db = getDb(d1);
  const pending = await db.select().from(payments).where(eq(payments.purchaseOrderId, poId)).all();
  for (const p of pending.filter((x) => x.status === 'pending' && x.amountCents > newTotal)) {
    const fee = p.amountCents > 0 ? Math.round((newTotal * p.feeCents) / p.amountCents) : 0;
    await db
      .update(payments)
      .set({ amountCents: newTotal, feeCents: fee, netCents: newTotal - fee, updatedAt: now })
      .where(eq(payments.id, p.id))
      .run();
    await db
      .update(codCollections)
      .set({ expectedCents: newTotal, updatedAt: now })
      .where(eq(codCollections.paymentId, p.id))
      .run();
  }
}
