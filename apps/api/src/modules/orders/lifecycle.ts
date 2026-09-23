import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { orderReturns, payments, purchaseOrders, type PurchaseOrder } from '@vyro/db/schema';
import {
  canResolveDispute,
  canTransition,
  DISPATCHABLE_PAYMENT_STATES,
  isReasonRequired,
  NotificationType,
  OPEN_RETURN_STATUSES,
  ORDER_STATUS_COPY,
  ORDER_STATUS_NOTIFICATION,
  type ActorRole,
  type OrderStatus,
} from '@vyro/shared';
import { hasProofOfDelivery } from '@vyro/validation/delivery';
import { httpError } from '../../lib/errors';
import { insertOrderEvent } from '../purchaseOrders/repository';
import { inventoryService } from '../inventory/service';
import { notifyOrderParties } from '../notifications/dispatcher';
import { recordAudit } from '../supplierProducts/repository';
import { refundAllForOrder, type RefundOutcome } from '../refunds/executor';
import { releaseDrawdown } from '../credit/service';
import { getPaymentSummary } from '../payments/summary';
import { DAY_MS, getLifecycleConfig } from './config';
import type { Env } from '../../env';

/**
 * THE order status pipeline. Every change to `purchase_orders.status` after
 * creation goes through `applyTransition` — buyer/supplier actions, admin
 * overrides, dispute resolution, delivery sync and lifecycle crons — so every
 * move gets the same guards and the same side effects, exactly once.
 */

export type LifecycleEnv = Pick<Env, 'DB'> & Partial<Env>;

export type DisputeResolution = 'refund_business' | 'release_supplier' | 'partial';

export interface ApplyTransitionInput {
  poId: string;
  to: OrderStatus;
  actor: { role: ActorRole; userId: string | null };
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  opts?: {
    /** Admin force-move (audited as an override). */
    override?: boolean;
    /** Exit from `disputed` via the resolution flow (money already settled). */
    disputeResolution?: DisputeResolution;
    /** Caller already settled money (dispute resolution). */
    skipRefund?: boolean;
    /** Optimistic guard: fail with 409 unless the order is still in this state. */
    expectedFrom?: OrderStatus;
    /** Free-form origin tag recorded on the event (e.g. 'delivery.sync', 'cron'). */
    via?: string;
    /** Stamped on the order for system moves ('auto_cancelled' | 'auto_completed'). */
    autoAction?: string;
    now?: number;
  };
}

export interface ApplyTransitionResult {
  ok: true;
  from: OrderStatus;
  to: OrderStatus;
  refunds: RefundOutcome[];
}

const TS_COLUMN: Partial<Record<OrderStatus, keyof PurchaseOrder>> = {
  accepted: 'acceptedAt',
  rejected: 'rejectedAt',
  preparing: 'preparedAt',
  ready_for_pickup: 'readyAt',
  out_for_delivery: 'dispatchedAt',
  delivered: 'deliveredAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
  disputed: 'disputedAt',
};

/** Timestamps that record the FIRST time an order reached a state. */
const FIRST_TIME_ONLY: ReadonlySet<keyof PurchaseOrder> = new Set(['deliveredAt', 'disputedAt', 'completedAt']);

export async function loadPo(d1: D1Database, poId: string): Promise<PurchaseOrder | null> {
  return ((await getDb(d1).select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get()) as PurchaseOrder | undefined) ?? null;
}

export async function countOpenReturns(d1: D1Database, poId: string): Promise<number> {
  const rows = await getDb(d1)
    .select({ id: orderReturns.id })
    .from(orderReturns)
    .where(and(eq(orderReturns.purchaseOrderId, poId), inArray(orderReturns.status, [...OPEN_RETURN_STATUSES])))
    .all();
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                      */
/* -------------------------------------------------------------------------- */

async function runGuards(env: LifecycleEnv, po: PurchaseOrder, input: ApplyTransitionInput, now: number): Promise<void> {
  const from = po.status as OrderStatus;
  const { to, actor, opts } = input;

  if (opts?.expectedFrom && opts.expectedFrom !== from) {
    throw httpError(409, 'STALE_STATE', `Order is ${from}, expected ${opts.expectedFrom}`);
  }

  const edgeOk = opts?.disputeResolution
    ? actor.role === 'admin' && canResolveDispute(from, to)
    : canTransition(from, to, actor.role);
  if (!edgeOk) {
    throw httpError(409, 'CONFLICT', `Illegal transition ${from} -> ${to} for ${actor.role}`);
  }

  if (isReasonRequired(to) && !input.reason?.trim()) {
    throw httpError(422, 'REASON_REQUIRED', `A reason is required to move an order to ${to}`);
  }

  const cfg = await getLifecycleConfig(env.DB);

  // Buyers get a bounded window to dispute; ops can always open one.
  if (to === 'disputed' && actor.role === 'business') {
    const base = po.deliveredAt ?? po.completedAt;
    if (base && now > base + cfg.disputeWindowDays * DAY_MS) {
      throw httpError(422, 'DISPUTE_WINDOW_CLOSED', `Disputes must be opened within ${cfg.disputeWindowDays} days of delivery`);
    }
  }

  // Auto-complete must never close an order with an open return.
  if (to === 'completed' && actor.role === 'system' && (await countOpenReturns(env.DB, po.id)) > 0) {
    throw httpError(409, 'RETURN_OPEN', 'Order has an open return');
  }

  // Payment gate: prepaid orders must be paid before goods leave the supplier.
  if (to === 'out_for_delivery' && cfg.paymentGateEnabled && actor.role !== 'admin') {
    const summary = await getPaymentSummary(env.DB, po.id);
    if (summary && !DISPATCHABLE_PAYMENT_STATES.includes(summary.state)) {
      throw httpError(402, 'PAYMENT_REQUIRED', 'This order must be paid before it can be dispatched', {
        paymentState: summary.state,
        dueCents: summary.dueCents,
      });
    }
  }

  // Suppliers must capture proof of delivery (recipient + photo/note) before
  // an order counts as delivered. Ops can record deliveries without it.
  if (to === 'delivered' && actor.role === 'supplier') {
    const { findDeliveryByPo } = await import('../deliveries/repository');
    const delivery = await findDeliveryByPo(env.DB, po.id);
    if (!delivery || !hasProofOfDelivery(delivery)) {
      throw httpError(422, 'POD_REQUIRED', 'Record the recipient name and a photo or note before marking delivered');
    }
  }

  // Cross-border customs-doc gate (domestic orders unaffected).
  if (to === 'ready_for_pickup' && po.direction !== 'domestic') {
    const { listDocsForOrder } = await import('../cross-border/repository');
    const docs = await listDocsForOrder(getDb(env.DB), po.id);
    const kinds = new Set(docs.map((d: { kind: string }) => d.kind));
    if (!kinds.has('invoice')) {
      throw httpError(422, 'MISSING_CUSTOMS_DOC', 'Commercial invoice required for cross-border shipment');
    }
    if (po.direction === 'export' && !kinds.has('coo')) {
      throw httpError(422, 'MISSING_CUSTOMS_DOC', 'Certificate of origin required for export');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                    */
/* -------------------------------------------------------------------------- */

export async function applyTransition(env: LifecycleEnv, input: ApplyTransitionInput): Promise<ApplyTransitionResult> {
  const d1 = env.DB;
  const db = getDb(d1);
  const now = input.opts?.now ?? Date.now();
  const po = await loadPo(d1, input.poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  const from = po.status as OrderStatus;
  const { to, actor } = input;
  const reason = input.reason?.trim() || null;

  await runGuards(env, po, input, now);

  // ---- status write (compare-and-set on the current status) ----
  const patch: Record<string, unknown> = { status: to, updatedAt: now };
  const tsCol = TS_COLUMN[to];
  if (tsCol && !(FIRST_TIME_ONLY.has(tsCol) && po[tsCol] != null)) patch[tsCol] = now;
  if (to === 'rejected') patch.rejectionReason = reason;
  if (to === 'cancelled') {
    patch.cancelledReason = reason;
    patch.cancelledByRole = actor.role;
  }
  if (to === 'disputed') {
    patch.disputeReason = reason;
    patch.disputeOpenedBy = actor.role;
  }
  if (input.opts?.disputeResolution) {
    patch.disputeOutcome = input.opts.disputeResolution;
    patch.disputeResolvedAt = now;
  }
  if (input.opts?.autoAction) patch.autoAction = input.opts.autoAction;
  if (to === 'ready_for_pickup' && po.direction !== 'domestic') {
    patch.customsStatus = 'pending';
    patch.commercialInvoiceNo = `INV-${po.poNumber}`;
  }
  const res = await db
    .update(purchaseOrders)
    .set(patch as never)
    .where(and(eq(purchaseOrders.id, po.id), eq(purchaseOrders.status, from)))
    .run();
  if (changesOf(res) === 0) {
    throw httpError(409, 'STALE_STATE', 'Order changed while this action was in progress; refresh and retry');
  }

  await insertOrderEvent(d1, {
    purchaseOrderId: po.id,
    actorUserId: actor.userId,
    fromStatus: from,
    toStatus: to,
    reason: input.opts?.override ? `admin override: ${reason ?? ''}`.trim() : reason,
    metadata: {
      actorRole: actor.role,
      ...(input.opts?.via ? { via: input.opts.via } : {}),
      ...(input.opts?.override ? { override: true } : {}),
      ...(input.opts?.disputeResolution ? { disputeResolution: input.opts.disputeResolution } : {}),
      ...(input.opts?.autoAction ? { autoAction: input.opts.autoAction } : {}),
      ...(input.metadata ?? {}),
    },
  });

  const after: PurchaseOrder = { ...po, ...(patch as Partial<PurchaseOrder>) };
  const refunds = await runSideEffects(env, po, after, input, from, now);
  await notify(env, after, input, from, reason, refunds);

  await recordAudit(d1, {
    actorUserId: actor.userId, // null = system (audit_logs.actor_user_id is an FK)
    action: input.opts?.override ? 'po.override' : `po.${to}`,
    resourceType: 'purchase_order',
    resourceId: po.id,
    metadata: {
      from,
      to,
      reason,
      actorRole: actor.role,
      via: input.opts?.via ?? null,
      refunds: refunds.map((r) => ({ id: r.refundId, status: r.status, amountCents: r.amountCents })),
    },
  }).catch((err: unknown) => console.error('[lifecycle] audit failed', err));

  return { ok: true, from, to, refunds };
}

async function runSideEffects(
  env: LifecycleEnv,
  before: PurchaseOrder,
  po: PurchaseOrder,
  input: ApplyTransitionInput,
  from: OrderStatus,
  now: number,
): Promise<RefundOutcome[]> {
  const d1 = env.DB;
  const queue = env.NOTIFICATIONS_QUEUE;
  const { to, actor } = input;
  const actorId = actor.userId;
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      // A legal status move is never rolled back because a projection failed;
      // failures are logged loudly for the ops sweep.
      console.error(`[lifecycle] ${name} failed`, { poId: po.id, from, to, err });
    }
  };

  // ---- stock ----
  if (to === 'cancelled' || to === 'rejected') {
    await step('stock.release', () => inventoryService.releaseForOrder(d1, queue, po.id, actorId, `order ${to}`));
  } else if (to === 'delivered') {
    await step('stock.commit', () => inventoryService.commitForOrder(d1, queue, po.id, actorId));
  }

  // ---- money: an order that dies returns every rupee ----
  let refunds: RefundOutcome[] = [];
  if ((to === 'cancelled' || to === 'rejected') && !input.opts?.skipRefund) {
    await step('refunds', async () => {
      refunds = await refundAllForOrder(env, {
        poId: po.id,
        source: to === 'rejected' ? 'reject' : 'cancel',
        reason: input.reason ?? `order ${to}`,
        actorUserId: actorId,
        keyPrefix: `${to}:${po.id}`,
      });
    });
    await step('credit.release', async () => {
      const rel = await releaseDrawdown(d1, { poId: po.id, userId: actorId, reason: `order ${to}`, now });
      // Credit repayments are free-form (no payment row to refund through the
      // gateway), so anything the buyer already repaid goes to finance.
      if (rel && rel.overpaidCents > 0 && env.DB) {
        const { notifyAdmins } = await import('../notifications/dispatcher');
        await notifyAdmins(env as Env, {
          role: 'finance',
          severity: 'warning',
          category: 'admin_alert',
          title: `Credit repayment to refund on ${po.poNumber}`,
          body: `Order ${to} after the buyer repaid part of its credit. Refund LKR ${(rel.overpaidCents / 100).toFixed(2)} to the buyer.`,
          link: `/admin/orders/${po.id}`,
          sourceRef: `credit-overpaid:${po.id}`,
        });
      }
    });
    // Unsettled payment intents (COD to collect, transfer awaiting verification) die with the order.
    await step('payments.void', () =>
      getDb(d1)
        .update(payments)
        .set({ status: 'cancelled', cancelledAt: now, statusReason: `order ${to}`, updatedAt: now })
        .where(and(eq(payments.purchaseOrderId, po.id), eq(payments.status, 'pending')))
        .run(),
    );
  }

  // ---- settlement eligibility follows order state ----
  await step('eligibility', async () => {
    const { recomputeEligibilityForPo } = await import('../finance/earnings');
    await recomputeEligibilityForPo(d1, po.id);
  });

  // ---- reviews: hide while disputed, restore after ----
  await step('reviews.hooks', async () => {
    const hooks = await import('../reviews/hooks');
    if (to === 'disputed') await hooks.onOrderDisputeOpened(d1, po.id);
    else if (from === 'disputed') await hooks.onOrderDisputeResolved(d1, po.id);
  });
  if (to === 'delivered') {
    await step('reviews.aggregate', async () => {
      const { recomputeAggregate } = await import('../reviews/service');
      await recomputeAggregate(d1, po.supplierId);
    });
  }

  // ---- trust signals ----
  if (to === 'delivered' || to === 'completed' || to === 'disputed' || from === 'disputed' || (to === 'cancelled' && actor.role === 'supplier')) {
    await step('trust', async () => {
      const { recomputeForSupplier } = await import('../trust/service');
      await recomputeForSupplier(d1, po.supplierId);
    });
  }

  // ---- promised delivery date (first time only) ----
  if (to === 'preparing' && before.deliveryPromisedAt == null) {
    await step('promisedAt', async () => {
      const lead = await d1
        .prepare(
          `SELECT MAX(sp.lead_time_days) AS lead
           FROM purchase_order_items poi
           JOIN supplier_products sp ON sp.id = poi.supplier_product_id
           WHERE poi.purchase_order_id = ? AND poi.quantity > 0`,
        )
        .bind(po.id)
        .first<{ lead: number | null }>();
      const days = Math.max(1, Number(lead?.lead ?? 1));
      await d1
        .prepare('UPDATE purchase_orders SET delivery_promised_at = ? WHERE id = ? AND delivery_promised_at IS NULL')
        .bind(now + days * DAY_MS, po.id)
        .run();
    });
  }

  // ---- delivery record exists as soon as goods move, and mirrors the order ----
  if (to === 'ready_for_pickup' || to === 'out_for_delivery' || to === 'delivered') {
    await step('delivery.sync', async () => {
      const { ensureDelivery, updateDelivery } = await import('../deliveries/repository');
      const d = await ensureDelivery(d1, po.id);
      // The delivery route drives its own row; only mirror for other callers.
      if (input.opts?.via === 'delivery.sync') return;
      if (to === 'out_for_delivery' && (d.status === 'pending' || d.status === 'assigned')) {
        await updateDelivery(d1, po.id, { status: 'in_transit', pickedUpAt: d.pickedUpAt ?? now }, d.status);
      }
      if (to === 'delivered' && d.status !== 'delivered') {
        await updateDelivery(d1, po.id, { status: 'delivered', deliveredAt: now });
      }
    });
  }

  return refunds;
}

async function notify(
  env: LifecycleEnv,
  po: PurchaseOrder,
  input: ApplyTransitionInput,
  from: OrderStatus,
  reason: string | null,
  refunds: RefundOutcome[],
): Promise<void> {
  const { to, actor } = input;
  const copy = ORDER_STATUS_COPY[to];
  const type = ORDER_STATUS_NOTIFICATION[to] ?? NotificationType.ORDER_PLACED;
  let buyer = copy?.buyer ?? `Status changed to ${to}.`;
  let supplier = copy?.supplier ?? `Status changed to ${to}.`;
  if (to === 'cancelled') {
    const who =
      actor.role === 'business' ? 'the buyer' : actor.role === 'supplier' ? 'the supplier' : actor.role === 'system' ? 'automatically' : 'VYRO support';
    buyer = supplier = actor.role === 'system' ? 'This order was cancelled automatically.' : `This order was cancelled by ${who}.`;
    if (refunds.length) buyer += ' Any payment made will be refunded.';
  }
  if (to === 'completed' && actor.role === 'system') {
    buyer = 'This order was completed automatically after the confirmation window.';
    supplier = 'The order was auto-completed; funds are now eligible for settlement.';
  }
  if (from === 'disputed') {
    buyer = supplier = to === 'cancelled' ? 'The dispute was resolved and the order refunded.' : 'The dispute was resolved.';
  }
  const suffix = reason ? ` Reason: ${reason}` : '';
  try {
    await notifyOrderParties(
      env.DB,
      env.NOTIFICATIONS_QUEUE,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type: from === 'disputed' ? NotificationType.DISPUTE_RESOLVED : type,
        title: `Order ${po.poNumber} ${copy?.label ?? to}`,
        body: `${buyer}${suffix}`,
        supplierBody: `${supplier}${suffix}`,
        supplierLink: `/supplier/orders/${po.id}`,
        excludeUserId: actor.userId,
      },
    );
  } catch (err) {
    console.error('[lifecycle] notify failed', { poId: po.id, err });
  }
}

function changesOf(result: unknown): number {
  const r = result as { meta?: { changes?: number }; changes?: number; rowsAffected?: number } | undefined;
  return Number(r?.meta?.changes ?? r?.changes ?? r?.rowsAffected ?? 0);
}
