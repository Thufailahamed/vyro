import { and, eq, gte, inArray, isNotNull, isNull, lt, notInArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { orderReturns, purchaseOrders } from '@vyro/db/schema';
import { NotificationType } from '@vyro/shared';
import { applyTransition } from '../modules/orders/lifecycle';
import { DAY_MS, HOUR_MS, ensureAutomationSince, getLifecycleConfig } from '../modules/orders/config';
import { listStaleRequestedReturns, markEscalated } from '../modules/returns/service';
import { notifyAdmins, notifyOrderParties } from '../modules/notifications/dispatcher';
import type { Env } from '../env';

const BATCH = 100;
const SYSTEM = { role: 'system' as const, userId: null };

/** Delivery promised but not delivered, still in an active fulfilment state. */
const ACTIVE_FULFILMENT = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'];

export interface OrderLifecycleRunResult {
  autoCancelled: number;
  autoCompleted: number;
  returnsEscalated: number;
  slaBreaches: number;
  errors: number;
  skipped?: 'disabled';
}

/**
 * Hourly order automation:
 *  1. pending orders the supplier never answered → cancelled (refund + stock release via pipeline)
 *  2. delivered orders past the confirmation window with no open return → completed (settlement eligible)
 *  3. return requests the supplier ignored → escalated to ops (never auto-approved)
 *  4. orders past their promised delivery date → supplier + ops alerted once
 * Every move passes `expectedFrom`, so a cron racing a human is a harmless 409.
 */
export async function handleOrderLifecycle(env: Env, now: number = Date.now()): Promise<OrderLifecycleRunResult> {
  const out: OrderLifecycleRunResult = { autoCancelled: 0, autoCompleted: 0, returnsEscalated: 0, slaBreaches: 0, errors: 0 };
  const cfg = await getLifecycleConfig(env.DB);
  if (!cfg.automationEnabled) return { ...out, skipped: 'disabled' };
  const db = getDb(env.DB);
  const since = await ensureAutomationSince(env.DB, now);

  // 1. Auto-cancel unanswered pending orders (only ones placed after automation went live).
  const pendingCutoff = now - cfg.pendingAutoCancelHours * HOUR_MS;
  const stalePending = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.status, 'pending'), lt(purchaseOrders.createdAt, pendingCutoff), gte(purchaseOrders.createdAt, since)))
    .limit(BATCH)
    .all();
  for (const po of stalePending) {
    try {
      await applyTransition(env, {
        poId: po.id,
        to: 'cancelled',
        actor: SYSTEM,
        reason: `auto: supplier did not respond within ${cfg.pendingAutoCancelHours}h`,
        opts: { expectedFrom: 'pending', via: 'cron.order-lifecycle', autoAction: 'auto_cancelled', now },
      });
      out.autoCancelled++;
    } catch (err) {
      out.errors++;
      console.warn('[cron.orderLifecycle] auto-cancel skipped', { poId: po.id, err: String(err) });
    }
  }

  // 2. Auto-complete delivered orders after the confirmation window.
  const deliveredCutoff = now - cfg.autoCompleteDays * DAY_MS;
  const openReturnPoIds = db
    .select({ id: orderReturns.purchaseOrderId })
    .from(orderReturns)
    .where(inArray(orderReturns.status, ['requested', 'approved', 'received']));
  const dueDelivered = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.status, 'delivered'),
        isNotNull(purchaseOrders.deliveredAt),
        lt(purchaseOrders.deliveredAt, deliveredCutoff),
        notInArray(purchaseOrders.id, openReturnPoIds),
      ),
    )
    .limit(BATCH)
    .all();
  for (const po of dueDelivered) {
    try {
      await applyTransition(env, {
        poId: po.id,
        to: 'completed',
        actor: SYSTEM,
        reason: `auto: no issue reported within ${cfg.autoCompleteDays} days of delivery`,
        opts: { expectedFrom: 'delivered', via: 'cron.order-lifecycle', autoAction: 'auto_completed', now },
      });
      out.autoCompleted++;
    } catch (err) {
      out.errors++;
      console.warn('[cron.orderLifecycle] auto-complete skipped', { poId: po.id, err: String(err) });
    }
  }

  // 3. Escalate ignored return requests.
  const stale = await listStaleRequestedReturns(env.DB, now - cfg.returnEscalationDays * DAY_MS);
  for (const r of stale.slice(0, BATCH)) {
    try {
      await notifyAdmins(env, {
        role: 'ops',
        severity: 'warning',
        category: 'admin_alert',
        title: `Return ${r.rmaNumber} unanswered`,
        body: `Supplier has not responded to a return request for ${cfg.returnEscalationDays}+ days.`,
        link: `/admin/returns?id=${r.id}`,
        sourceRef: `return:${r.id}`,
      });
      await markEscalated(env.DB, r.id, now);
      out.returnsEscalated++;
    } catch (err) {
      out.errors++;
      console.warn('[cron.orderLifecycle] return escalation failed', { id: r.id, err: String(err) });
    }
  }

  // 4. SLA breaches: promised date passed, not yet delivered. Alert once per order
  //    (stamping auto_action = 'sla_breach_notified' when none is set).
  const breached = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      businessId: purchaseOrders.businessId,
      supplierId: purchaseOrders.supplierId,
    })
    .from(purchaseOrders)
    .where(
      and(
        inArray(purchaseOrders.status, ACTIVE_FULFILMENT),
        isNotNull(purchaseOrders.deliveryPromisedAt),
        lt(purchaseOrders.deliveryPromisedAt, now),
        isNull(purchaseOrders.autoAction),
      ),
    )
    .limit(BATCH)
    .all();
  for (const po of breached) {
    try {
      await db.update(purchaseOrders).set({ autoAction: 'sla_breach_notified' }).where(eq(purchaseOrders.id, po.id)).run();
      await notifyOrderParties(env.DB, env.NOTIFICATIONS_QUEUE, po, {
        type: NotificationType.ORDER_SLA_BREACH,
        title: `Order ${po.poNumber} is past its promised delivery date`,
        body: 'The supplier has been reminded. You can message them from the order page.',
        supplierBody: 'This order is past the delivery date you committed to. Please update the buyer.',
        supplierLink: `/supplier/orders/${po.id}`,
        audience: 'both',
      });
      out.slaBreaches++;
    } catch (err) {
      out.errors++;
      console.warn('[cron.orderLifecycle] sla notify failed', { poId: po.id, err: String(err) });
    }
  }
  if (out.slaBreaches > 0) {
    await notifyAdmins(env, {
      role: 'ops',
      severity: 'info',
      category: 'admin_alert',
      title: `${out.slaBreaches} order(s) breached delivery SLA`,
      body: 'Orders are past their promised delivery date without being delivered.',
      link: '/admin/orders?sla=breached',
    });
  }

  console.log('[cron.orderLifecycle] run', out);
  return out;
}

/** Live count for the admin command centre. */
export async function countSlaBreaches(d1: D1Database, now: number = Date.now()): Promise<number> {
  const rows = await getDb(d1)
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        inArray(purchaseOrders.status, ACTIVE_FULFILMENT),
        isNotNull(purchaseOrders.deliveryPromisedAt),
        lt(purchaseOrders.deliveryPromisedAt, now),
      ),
    )
    .all();
  return rows.length;
}
