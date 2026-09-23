import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { orderReturnItems, orderReturns, purchaseOrderItems, type OrderReturn } from '@vyro/db/schema';
import {
  canTransitionReturn,
  formatLKR,
  newId,
  NotificationType,
  OPEN_RETURN_STATUSES,
  RETURN_REASON_LABEL,
  type ReturnActor,
  type ReturnReasonCode,
  type ReturnStatus,
} from '@vyro/shared';
import type { ReturnCreateInput } from '@vyro/validation/orderLifecycle';
import { httpError } from '../../lib/errors';
import { restockReturnedLines } from '../inventory/service';
import { refundAmountForOrder } from '../refunds/executor';
import { releaseDrawdown } from '../credit/service';
import { notifyOrderParties } from '../notifications/dispatcher';
import { recordAudit } from '../supplierProducts/repository';
import { DAY_MS, getLifecycleConfig } from '../orders/config';
import { loadPo, type LifecycleEnv } from '../orders/lifecycle';
import { findReturn, getReturnWithItems, loadReturnItems } from './repository';

/**
 * Returns / RMA. A return never changes the order's status: the order stays
 * delivered/completed while the return runs its own small state machine.
 * While a return is open the supplier's settlement is held and auto-complete
 * is paused; receiving the goods restocks, refunds and issues a credit note.
 */

type Actor = { role: ReturnActor; userId: string };

function rmaNumber(poNumber: string): string {
  return `RMA-${poNumber.replace(/^PO-/, '')}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

/** Unit refund value of a line: its (discounted) total spread across units. */
function unitValue(lineTotalCents: number, quantity: number): number {
  return quantity > 0 ? Math.floor(lineTotalCents / quantity) : 0;
}

/**
 * Units of each line already claimed by non-terminal / completed returns,
 * so the same unit can never be returned twice.
 */
async function claimedByLine(d1: D1Database, poId: string, excludeReturnId?: string): Promise<Map<string, number>> {
  const db = getDb(d1);
  const rets = await db
    .select({ id: orderReturns.id, status: orderReturns.status })
    .from(orderReturns)
    .where(eq(orderReturns.purchaseOrderId, poId))
    .all();
  const live = rets.filter((r) => r.id !== excludeReturnId && !['rejected', 'cancelled'].includes(r.status)).map((r) => r.id);
  const out = new Map<string, number>();
  if (live.length === 0) return out;
  const items = await db.select().from(orderReturnItems).where(inArray(orderReturnItems.returnId, live)).all();
  const statusById = new Map(rets.map((r) => [r.id, r.status]));
  for (const i of items) {
    const st = statusById.get(i.returnId);
    // Once received, the received quantity is what counts; before that, the claim.
    const q = st === 'received' || st === 'refunded' || st === 'closed' ? (i.receivedQuantity ?? 0) : (i.approvedQuantity ?? i.quantity);
    out.set(i.purchaseOrderItemId, (out.get(i.purchaseOrderItemId) ?? 0) + q);
  }
  return out;
}

async function recomputeEligibility(d1: D1Database, poId: string): Promise<void> {
  try {
    const { recomputeEligibilityForPo } = await import('../finance/earnings');
    await recomputeEligibilityForPo(d1, poId);
  } catch (err) {
    console.error('[returns] eligibility recompute failed', { poId, err });
  }
}

async function notifyReturn(env: LifecycleEnv, ret: OrderReturn, title: string, body: string, actorUserId: string | null, audience: 'buyer' | 'supplier' | 'both' = 'both') {
  const po = await loadPo(env.DB, ret.purchaseOrderId);
  if (!po) return;
  try {
    await notifyOrderParties(
      env.DB,
      env.NOTIFICATIONS_QUEUE,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type: ret.status === 'requested' ? NotificationType.RETURN_REQUESTED : NotificationType.RETURN_UPDATED,
        title,
        body,
        link: `/orders/${po.id}`,
        supplierLink: `/supplier/orders/${po.id}`,
        audience,
        excludeUserId: actorUserId,
      },
    );
  } catch {
    /* best-effort */
  }
}

export async function createReturn(env: LifecycleEnv, poId: string, actor: Actor, input: ReturnCreateInput) {
  const d1 = env.DB;
  const db = getDb(d1);
  const cfg = await getLifecycleConfig(d1);
  if (!cfg.returnsEnabled) throw httpError(403, 'RETURNS_DISABLED', 'Returns are not enabled');
  const po = await loadPo(d1, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (po.status !== 'delivered' && po.status !== 'completed') {
    throw httpError(409, 'CONFLICT', 'Only delivered or completed orders can be returned');
  }
  const base = po.deliveredAt ?? po.completedAt ?? po.updatedAt;
  const now = Date.now();
  if (actor.role !== 'admin' && now > base + cfg.returnWindowDays * DAY_MS) {
    throw httpError(422, 'RETURN_WINDOW_CLOSED', `Returns must be requested within ${cfg.returnWindowDays} days of delivery`);
  }

  const lines = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id)).all();
  const byId = new Map(lines.map((l) => [l.id, l]));
  const claimed = await claimedByLine(d1, po.id);
  const merged = new Map<string, { quantity: number; conditionNote?: string | undefined }>();
  for (const l of input.lines) {
    const prev = merged.get(l.itemId);
    merged.set(l.itemId, { quantity: (prev?.quantity ?? 0) + l.quantity, conditionNote: l.conditionNote ?? prev?.conditionNote });
  }
  const rows: Array<{ poi: (typeof lines)[number]; quantity: number; unit: number; conditionNote: string | null }> = [];
  for (const [itemId, l] of merged) {
    const poi = byId.get(itemId);
    if (!poi) throw httpError(400, 'VALIDATION_ERROR', `Unknown order line ${itemId}`);
    const left = poi.quantity - (claimed.get(itemId) ?? 0);
    if (l.quantity > left) {
      throw httpError(400, 'VALIDATION_ERROR', `${poi.productNameSnapshot}: only ${Math.max(0, left)} unit(s) can still be returned`);
    }
    rows.push({ poi, quantity: l.quantity, unit: unitValue(poi.lineTotalCents, poi.quantity), conditionNote: l.conditionNote ?? null });
  }

  const id = newId();
  const refundEstimate = rows.reduce((s, r) => s + r.unit * r.quantity, 0);
  await db
    .insert(orderReturns)
    .values({
      id,
      rmaNumber: rmaNumber(po.poNumber),
      purchaseOrderId: po.id,
      businessId: po.businessId,
      supplierId: po.supplierId,
      status: 'requested',
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote ?? null,
      requestedByUserId: actor.userId,
      refundCents: refundEstimate,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  for (const r of rows) {
    await db
      .insert(orderReturnItems)
      .values({
        id: newId(),
        returnId: id,
        purchaseOrderItemId: r.poi.id,
        quantity: r.quantity,
        unitRefundCents: r.unit,
        conditionNote: r.conditionNote,
      })
      .run();
  }
  await recomputeEligibility(d1, po.id);
  const ret = (await findReturn(d1, id))!;
  await recordAudit(d1, {
    actorUserId: actor.userId,
    action: 'return.requested',
    resourceType: 'purchase_order',
    resourceId: po.id,
    metadata: { returnId: id, rma: ret.rmaNumber, lines: rows.map((r) => ({ itemId: r.poi.id, qty: r.quantity })) },
  }).catch(() => undefined);
  await notifyReturn(
    env,
    ret,
    `Return requested on ${po.poNumber}`,
    `${RETURN_REASON_LABEL[input.reasonCode as ReturnReasonCode] ?? input.reasonCode}: ${rows.length} line(s), up to ${formatLKR(refundEstimate)}.`,
    actor.userId,
    'supplier',
  );
  return getReturnWithItems(d1, id);
}

async function moveReturn(
  d1: D1Database,
  ret: OrderReturn,
  to: ReturnStatus,
  actor: { role: ReturnActor; userId: string | null },
  patch: Partial<typeof orderReturns.$inferInsert>,
): Promise<void> {
  if (!canTransitionReturn(ret.status as ReturnStatus, to, actor.role)) {
    throw httpError(409, 'CONFLICT', `Return is ${ret.status}; cannot move to ${to} as ${actor.role}`);
  }
  const res = await getDb(d1)
    .update(orderReturns)
    .set({ ...patch, status: to, updatedAt: Date.now() })
    .where(and(eq(orderReturns.id, ret.id), eq(orderReturns.status, ret.status)))
    .run();
  const changes = Number((res as { meta?: { changes?: number } }).meta?.changes ?? 0);
  if (changes === 0) throw httpError(409, 'STALE_STATE', 'Return changed; refresh and retry');
}

export async function approveReturn(
  env: LifecycleEnv,
  id: string,
  actor: Actor,
  input: { note?: string | undefined; lines?: Array<{ returnItemId: string; quantity: number }> | undefined },
) {
  const d1 = env.DB;
  const ret = await findReturn(d1, id);
  if (!ret) throw httpError(404, 'NOT_FOUND', 'Return not found');
  const items = await loadReturnItems(d1, [id]);
  const approved = new Map(input.lines?.map((l) => [l.returnItemId, l.quantity]) ?? []);
  for (const it of items) {
    const q = approved.has(it.id) ? approved.get(it.id)! : it.quantity;
    if (q > it.quantity) throw httpError(400, 'VALIDATION_ERROR', 'Cannot approve more than requested');
    await getDb(d1).update(orderReturnItems).set({ approvedQuantity: q }).where(eq(orderReturnItems.id, it.id)).run();
  }
  const estimate = items.reduce((s, it) => s + it.unitRefundCents * (approved.get(it.id) ?? it.quantity), 0);
  await moveReturn(d1, ret, 'approved', actor, {
    decidedByUserId: actor.userId,
    decidedAt: Date.now(),
    supplierNote: input.note ?? null,
    refundCents: estimate,
  });
  const fresh = (await findReturn(d1, id))!;
  await notifyReturn(env, fresh, `Return ${fresh.rmaNumber} approved`, `Please send the goods back quoting ${fresh.rmaNumber}.${input.note ? ` Note: ${input.note}` : ''}`, actor.userId, 'buyer');
  await audit(d1, actor, 'return.approved', fresh);
  return getReturnWithItems(d1, id);
}

export async function rejectReturn(env: LifecycleEnv, id: string, actor: Actor, reason: string) {
  const d1 = env.DB;
  const ret = await findReturn(d1, id);
  if (!ret) throw httpError(404, 'NOT_FOUND', 'Return not found');
  await moveReturn(d1, ret, 'rejected', actor, { decidedByUserId: actor.userId, decidedAt: Date.now(), rejectionReason: reason, refundCents: 0 });
  await recomputeEligibility(d1, ret.purchaseOrderId);
  const fresh = (await findReturn(d1, id))!;
  await notifyReturn(env, fresh, `Return ${fresh.rmaNumber} rejected`, `Reason: ${reason}. You can open a dispute if you disagree.`, actor.userId, 'buyer');
  await audit(d1, actor, 'return.rejected', fresh, { reason });
  return getReturnWithItems(d1, id);
}

export async function cancelReturn(env: LifecycleEnv, id: string, actor: Actor, reason: string) {
  const d1 = env.DB;
  const ret = await findReturn(d1, id);
  if (!ret) throw httpError(404, 'NOT_FOUND', 'Return not found');
  await moveReturn(d1, ret, 'cancelled', actor, { rejectionReason: reason, refundCents: 0 });
  await recomputeEligibility(d1, ret.purchaseOrderId);
  const fresh = (await findReturn(d1, id))!;
  await notifyReturn(env, fresh, `Return ${fresh.rmaNumber} cancelled`, `The buyer withdrew the return. Reason: ${reason}`, actor.userId, 'supplier');
  await audit(d1, actor, 'return.cancelled', fresh, { reason });
  return getReturnWithItems(d1, id);
}

/**
 * Supplier confirms the goods arrived. This is where money + stock move:
 * restock (per line), refund the received value, issue a credit note, then
 * close the return and release the settlement hold.
 */
export async function receiveReturn(
  env: LifecycleEnv,
  id: string,
  actor: Actor,
  input: {
    note?: string | undefined;
    lines?: Array<{ returnItemId: string; quantity: number; restock?: boolean | undefined; conditionNote?: string | undefined }> | undefined;
  },
) {
  const d1 = env.DB;
  const db = getDb(d1);
  const ret = await findReturn(d1, id);
  if (!ret) throw httpError(404, 'NOT_FOUND', 'Return not found');
  const items = await loadReturnItems(d1, [id]);
  const given = new Map(input.lines?.map((l) => [l.returnItemId, l]) ?? []);
  const received = items.map((it) => {
    const g = given.get(it.id);
    const max = it.approvedQuantity ?? it.quantity;
    const q = g ? g.quantity : max;
    if (q > max) throw httpError(400, 'VALIDATION_ERROR', `${it.productName ?? 'Line'}: received more than approved`);
    return { it, q, restock: g?.restock ?? it.restock, conditionNote: g?.conditionNote ?? it.conditionNote };
  });
  const now = Date.now();
  // Claim the state change first so a double-submit can't refund twice.
  await moveReturn(d1, ret, 'received', actor, { receivedByUserId: actor.userId, receivedAt: now, supplierNote: input.note ?? ret.supplierNote });
  for (const r of received) {
    await db
      .update(orderReturnItems)
      .set({ receivedQuantity: r.q, restock: r.restock, conditionNote: r.conditionNote ?? null })
      .where(eq(orderReturnItems.id, r.it.id))
      .run();
  }

  // Stock
  const po = (await loadPo(d1, ret.purchaseOrderId))!;
  const poLines = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id)).all();
  const spOf = new Map(poLines.map((l) => [l.id, l.supplierProductId]));
  try {
    await restockReturnedLines(
      d1,
      env.NOTIFICATIONS_QUEUE,
      received.filter((r) => r.restock && r.q > 0).map((r) => ({ supplierProductId: spOf.get(r.it.purchaseOrderItemId)!, quantity: r.q })),
      { purchaseOrderId: po.id, actorUserId: actor.userId, note: `return ${ret.rmaNumber}` },
    );
  } catch (err) {
    console.error('[returns] restock failed', { id, err });
  }

  // Money
  const refundCents = received.reduce((s, r) => s + r.q * r.it.unitRefundCents, 0);
  let refundIds: string[] = [];
  if (refundCents > 0) {
    try {
      const out = await refundAmountForOrder(env, {
        poId: po.id,
        amountCents: refundCents,
        source: 'return',
        sourceRefId: ret.id,
        reason: `Return ${ret.rmaNumber}`,
        actorUserId: actor.userId,
        keyPrefix: `return:${ret.id}`,
      });
      refundIds = out.refunds.map((r) => r.refundId);
      if (out.unrefundedCents > 0) {
        await releaseDrawdown(d1, { poId: po.id, amountCents: out.unrefundedCents, userId: actor.userId, reason: `return ${ret.rmaNumber}`, now });
      }
    } catch (err) {
      console.error('[returns] refund failed', { id, err });
    }
  }

  // Credit note
  let creditNoteId: string | null = null;
  try {
    const { generateCreditNote } = await import('../invoices/generate');
    const note = await generateCreditNote(d1, {
      poId: po.id,
      createdByUserId: actor.userId,
      lines: received
        .filter((r) => r.q > 0)
        .map((r) => ({
          description: `Return ${ret.rmaNumber}: ${r.it.productName ?? 'item'}`,
          quantity: r.q,
          unitCents: r.it.unitRefundCents,
          lineTotalCents: r.q * r.it.unitRefundCents,
        })),
    });
    creditNoteId = note?.id ?? null;
  } catch (err) {
    console.error('[returns] credit note failed', { id, err });
  }

  const afterReceive = (await findReturn(d1, id))!;
  await moveReturn(d1, afterReceive, 'refunded', { role: 'system', userId: null }, {
    refundCents,
    refundedAt: Date.now(),
    creditNoteInvoiceId: creditNoteId,
  });
  const refunded = (await findReturn(d1, id))!;
  await moveReturn(d1, refunded, 'closed', { role: 'system', userId: null }, {});
  await recomputeEligibility(d1, po.id);

  const fresh = (await findReturn(d1, id))!;
  await notifyReturn(env, fresh, `Return ${fresh.rmaNumber} received`, `The supplier received the goods. ${formatLKR(refundCents)} is being refunded.`, actor.userId, 'buyer');
  await audit(d1, actor, 'return.received', fresh, { refundCents, refundIds, creditNoteId });
  return getReturnWithItems(d1, id);
}

/** Open returns older than N days get flagged to ops (never auto-approved). */
export async function listStaleRequestedReturns(d1: D1Database, olderThan: number) {
  const rows = await getDb(d1)
    .select()
    .from(orderReturns)
    .where(eq(orderReturns.status, 'requested'))
    .all();
  return rows.filter((r) => r.requestedAt < olderThan && !r.escalatedAt);
}

export async function markEscalated(d1: D1Database, id: string, now: number): Promise<void> {
  await getDb(d1).update(orderReturns).set({ escalatedAt: now, updatedAt: now }).where(eq(orderReturns.id, id)).run();
}

export function isOpenReturn(status: string): boolean {
  return (OPEN_RETURN_STATUSES as readonly string[]).includes(status);
}

async function audit(d1: D1Database, actor: { userId: string | null }, action: string, ret: OrderReturn, extra?: Record<string, unknown>) {
  await recordAudit(d1, {
    actorUserId: actor.userId,
    action,
    resourceType: 'purchase_order',
    resourceId: ret.purchaseOrderId,
    metadata: { returnId: ret.id, rma: ret.rmaNumber, status: ret.status, ...(extra ?? {}) },
  }).catch(() => undefined);
}
