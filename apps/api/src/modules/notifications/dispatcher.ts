import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  businessMembers,
  notifications,
  purchaseOrders,
  supplierMembers,
  supplierSettings,
  userSettings,
} from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import {
  NotificationCategory,
  categoryForNotificationType,
} from '@vyro/shared';

/**
 * Central in-app notification dispatcher.
 *
 * Every notification in the product flows through here so that:
 *   - fan-out always covers *all* active members of the affected org(s),
 *   - user + supplier notification preferences are honoured at send time,
 *   - the NOTIFICATIONS_QUEUE receives a message for out-of-band channels.
 *
 * All functions are best-effort: a notification failure must never break the
 * business transaction that triggered it.
 */

export type NotifyAudience = 'buyer' | 'supplier' | 'both';

export interface NotifyPayload {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Overrides the category derived from `type`. */
  category?: NotificationCategory;
}

interface QueueLike {
  send: (body: unknown) => Promise<unknown>;
}

function isTruthyFlag(v: unknown): boolean {
  return v === 1 || v === true;
}

/** Preference column on `user_settings` that gates a category. */
function userPrefColumn(category: NotificationCategory): 'notifyOrderUpdates' | 'notifyMessages' | 'notifyMarketing' | null {
  switch (category) {
    case NotificationCategory.ORDER:
    case NotificationCategory.PAYMENT:
    case NotificationCategory.STOCK:
      return 'notifyOrderUpdates';
    case NotificationCategory.MESSAGE:
      return 'notifyMessages';
    case NotificationCategory.MARKETING:
      return 'notifyMarketing';
    default:
      return null; // system notices are never suppressed
  }
}

/**
 * Filters a user list down to those who opted in to the category. Users with
 * no `user_settings` row keep the schema defaults (opted in for order + message
 * updates, opted out of marketing).
 */
export async function filterUsersByPreference(
  d1: D1Database,
  userIds: string[],
  category: NotificationCategory,
): Promise<string[]> {
  const col = userPrefColumn(category);
  if (!col || userIds.length === 0) return userIds;
  const db = getDb(d1);
  const rows = await db
    .select({
      userId: userSettings.userId,
      notifyOrderUpdates: userSettings.notifyOrderUpdates,
      notifyMessages: userSettings.notifyMessages,
      notifyMarketing: userSettings.notifyMarketing,
    })
    .from(userSettings)
    .where(inArray(userSettings.userId, userIds))
    .all();
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  const defaultOptIn = category !== NotificationCategory.MARKETING;
  return userIds.filter((id) => {
    const row = byUser.get(id);
    if (!row) return defaultOptIn;
    return isTruthyFlag(row[col]);
  });
}

/** Supplier-level opt-outs (per supplier org, not per user). */
async function supplierWantsCategory(
  d1: D1Database,
  supplierId: string,
  type: string,
  category: NotificationCategory,
): Promise<boolean> {
  const db = getDb(d1);
  const row = await db
    .select({
      notifyNewOrders: supplierSettings.notifyNewOrders,
      notifyLowStock: supplierSettings.notifyLowStock,
      notifyPaymentReceived: supplierSettings.notifyPaymentReceived,
    })
    .from(supplierSettings)
    .where(eq(supplierSettings.supplierId, supplierId))
    .get();
  if (!row) return true; // defaults are all opt-in
  if (category === NotificationCategory.STOCK) return isTruthyFlag(row.notifyLowStock);
  if (category === NotificationCategory.PAYMENT) return isTruthyFlag(row.notifyPaymentReceived);
  if (type === 'order.placed') return isTruthyFlag(row.notifyNewOrders);
  return true;
}

export async function listBusinessMemberIds(d1: D1Database, businessId: string): Promise<string[]> {
  const db = getDb(d1);
  const rows = await db
    .select({ userId: businessMembers.userId })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.status, 'active')))
    .all();
  return rows.map((r) => r.userId);
}

export async function listSupplierMemberIds(d1: D1Database, supplierId: string): Promise<string[]> {
  const db = getDb(d1);
  const rows = await db
    .select({ userId: supplierMembers.userId })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.status, 'active')))
    .all();
  return rows.map((r) => r.userId);
}

/**
 * Inserts one notification row per (opted-in) user and enqueues a fan-out
 * message per row. Returns the ids created.
 */
export async function notifyUsers(
  d1: D1Database,
  queue: QueueLike | undefined,
  userIds: string[],
  payload: NotifyPayload,
): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const category = payload.category ?? categoryForNotificationType(payload.type);
  let recipients: string[];
  try {
    recipients = await filterUsersByPreference(d1, unique, category);
  } catch {
    recipients = unique;
  }
  if (recipients.length === 0) return [];

  const db = getDb(d1);
  const now = Date.now();
  const rows = recipients.map((userId) => ({
    id: newId(),
    userId,
    type: payload.type,
    title: payload.title.slice(0, 200),
    body: payload.body != null ? payload.body.slice(0, 2000) : null,
    link: payload.link ?? null,
    readAt: null as number | null,
    createdAt: now,
  }));
  try {
    await db.insert(notifications).values(rows).run();
  } catch {
    // Fall back to per-row inserts so one bad recipient cannot drop the batch.
    for (const row of rows) {
      try {
        await db.insert(notifications).values(row).run();
      } catch {
        /* ignore */
      }
    }
  }
  if (queue) {
    for (const row of rows) {
      try {
        await queue.send({
          notificationId: row.id,
          userId: row.userId,
          type: row.type,
          category,
          title: row.title,
          body: row.body,
          link: row.link,
        });
      } catch {
        /* queue is best-effort */
      }
    }
  }
  return rows.map((r) => r.id);
}

export interface NotifyOrderPartiesOptions extends NotifyPayload {
  audience?: NotifyAudience;
  /** Actor that triggered the event; never notified about their own action. */
  excludeUserId?: string | null;
  /** Separate copy for the supplier side (defaults to `body`). */
  supplierBody?: string | null;
  supplierTitle?: string | null;
  supplierLink?: string | null;
}

export interface OrderPartiesRef {
  id: string;
  poNumber: string;
  businessId: string;
  supplierId: string;
}

/**
 * Notifies both sides of a purchase order, honouring supplier-org opt-outs and
 * per-user preferences, and skipping the actor.
 */
export async function notifyOrderParties(
  d1: D1Database,
  queue: QueueLike | undefined,
  po: OrderPartiesRef,
  opts: NotifyOrderPartiesOptions,
): Promise<void> {
  const audience = opts.audience ?? 'both';
  const category = opts.category ?? categoryForNotificationType(opts.type);
  const exclude = opts.excludeUserId ?? null;

  if (audience === 'buyer' || audience === 'both') {
    try {
      const buyers = (await listBusinessMemberIds(d1, po.businessId)).filter((u) => u !== exclude);
      await notifyUsers(d1, queue, buyers, {
        type: opts.type,
        title: opts.title,
        body: opts.body ?? null,
        link: opts.link ?? `/orders/${po.id}`,
        category,
      });
    } catch {
      /* best-effort */
    }
  }

  if (audience === 'supplier' || audience === 'both') {
    try {
      const wants = await supplierWantsCategory(d1, po.supplierId, opts.type, category);
      if (wants) {
        const suppliersUsers = (await listSupplierMemberIds(d1, po.supplierId)).filter(
          (u) => u !== exclude,
        );
        await notifyUsers(d1, queue, suppliersUsers, {
          type: opts.type,
          title: opts.supplierTitle ?? opts.title,
          body: opts.supplierBody ?? opts.body ?? null,
          link: opts.supplierLink ?? `/supplier/orders?po=${po.id}`,
          category,
        });
      }
    } catch {
      /* best-effort */
    }
  }
}

/** Notifies every active member of a supplier org (stock alerts, payouts). */
export async function notifySupplierOrg(
  d1: D1Database,
  queue: QueueLike | undefined,
  supplierId: string,
  payload: NotifyPayload,
): Promise<void> {
  try {
    const category = payload.category ?? categoryForNotificationType(payload.type);
    const wants = await supplierWantsCategory(d1, supplierId, payload.type, category);
    if (!wants) return;
    const users = await listSupplierMemberIds(d1, supplierId);
    await notifyUsers(d1, queue, users, payload);
  } catch {
    /* best-effort */
  }
}

/** Notifies every active member of a buyer business org. */
export async function notifyBusinessOrg(
  d1: D1Database,
  queue: QueueLike | undefined,
  businessId: string,
  payload: NotifyPayload,
): Promise<void> {
  try {
    const users = await listBusinessMemberIds(d1, businessId);
    await notifyUsers(d1, queue, users, payload);
  } catch {
    /* best-effort */
  }
}

/** Loads the minimal PO reference the dispatcher needs. */
export async function loadOrderRef(
  d1: D1Database,
  poId: string,
): Promise<OrderPartiesRef | null> {
  const db = getDb(d1);
  const row = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      businessId: purchaseOrders.businessId,
      supplierId: purchaseOrders.supplierId,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId))
    .get();
  return row ?? null;
}
