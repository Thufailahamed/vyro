import { eq, sql, desc, and, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  purchaseOrderItems,
  purchaseOrders,
  stockMovements,
  supplierProducts,
} from '@vyro/db/schema';
import {
  availableQty,
  deriveAvailability,
  newId,
  NotificationType,
  type AvailabilityStatus,
  type StockMovementReason,
} from '@vyro/shared';
import { httpError } from '../../lib/errors';
import { notifySupplierOrg } from '../notifications/dispatcher';

interface QueueLike {
  send: (body: unknown) => Promise<unknown>;
}

export interface OfferInventory {
  id: string;
  supplierId: string;
  productId: string;
  minOrderQty: number;
  stockQty: number;
  reservedQty: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  availabilityStatus: AvailabilityStatus;
  active: boolean;
  deletedAt: number | null;
}

function changesOf(result: unknown): number {
  return (result as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0;
}

export async function getOfferInventory(
  d1: D1Database,
  offerId: string,
): Promise<OfferInventory | null> {
  const db = getDb(d1);
  const row = await db
    .select({
      id: supplierProducts.id,
      supplierId: supplierProducts.supplierId,
      productId: supplierProducts.productId,
      minOrderQty: supplierProducts.minOrderQty,
      stockQty: supplierProducts.stockQty,
      reservedQty: supplierProducts.reservedQty,
      lowStockThreshold: supplierProducts.lowStockThreshold,
      trackInventory: supplierProducts.trackInventory,
      availabilityStatus: supplierProducts.availabilityStatus,
      active: supplierProducts.active,
      deletedAt: supplierProducts.deletedAt,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, offerId))
    .get();
  return (row as OfferInventory | undefined) ?? null;
}

export async function recordMovement(
  d1: D1Database,
  row: {
    supplierProductId: string;
    supplierId: string;
    reason: StockMovementReason;
    qtyDelta: number;
    reservedDelta: number;
    stockQtyAfter: number;
    reservedQtyAfter: number;
    purchaseOrderId?: string | null;
    actorUserId?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const db = getDb(d1);
  try {
    await db
      .insert(stockMovements)
      .values({
        id: newId(),
        supplierProductId: row.supplierProductId,
        supplierId: row.supplierId,
        reason: row.reason,
        qtyDelta: row.qtyDelta,
        reservedDelta: row.reservedDelta,
        stockQtyAfter: row.stockQtyAfter,
        reservedQtyAfter: row.reservedQtyAfter,
        purchaseOrderId: row.purchaseOrderId ?? null,
        actorUserId: row.actorUserId ?? null,
        note: row.note ?? null,
        createdAt: Date.now(),
      })
      .run();
  } catch {
    // Ledger writes are best-effort: never fail the stock mutation on audit.
  }
}

/**
 * Recomputes `availability_status` from quantities for tracked offers and
 * raises supplier low/out-of-stock notifications on state changes.
 */
export async function syncAvailability(
  d1: D1Database,
  queue: QueueLike | undefined,
  offerId: string,
  opts: { previous?: AvailabilityStatus | null; notify?: boolean } = {},
): Promise<AvailabilityStatus | null> {
  const offer = await getOfferInventory(d1, offerId);
  if (!offer) return null;
  const derived = deriveAvailability(offer);
  if (derived !== offer.availabilityStatus) {
    const db = getDb(d1);
    await db
      .update(supplierProducts)
      .set({ availabilityStatus: derived, updatedAt: Date.now() })
      .where(eq(supplierProducts.id, offerId))
      .run();
  }
  const previous = opts.previous ?? offer.availabilityStatus;
  if (opts.notify !== false && derived !== previous && derived !== 'in_stock') {
    const free = availableQty(offer);
    const type = derived === 'out_of_stock' ? NotificationType.STOCK_OUT : NotificationType.STOCK_LOW;
    await notifySupplierOrg(d1, queue, offer.supplierId, {
      type,
      title: derived === 'out_of_stock' ? 'Offer out of stock' : 'Offer low on stock',
      body:
        derived === 'out_of_stock'
          ? 'A product you list has no available stock left. Restock it to keep selling.'
          : `Only ${free} unit(s) remain available on one of your listings.`,
      link: '/supplier/inventory',
    });
  }
  return derived;
}

export interface ReserveLine {
  supplierProductId: string;
  quantity: number;
}

/**
 * Atomically reserves stock for each line. The conditional UPDATE guarantees
 * two concurrent checkouts cannot oversell: the row is only updated when
 * `stock_qty - reserved_qty >= quantity` still holds at write time.
 *
 * Partial failure rolls back the reservations already made in this call.
 */
export async function reserveStockForLines(
  d1: D1Database,
  queue: QueueLike | undefined,
  lines: ReserveLine[],
  ctx: { purchaseOrderId?: string | null; actorUserId?: string | null },
): Promise<void> {
  const db = getDb(d1);
  const done: ReserveLine[] = [];
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const result = await db
      .update(supplierProducts)
      .set({
        reservedQty: sql`${supplierProducts.reservedQty} + ${line.quantity}`,
        updatedAt: Date.now(),
      })
      .where(
        sql`${supplierProducts.id} = ${line.supplierProductId}
          AND ${supplierProducts.deletedAt} IS NULL
          AND ${supplierProducts.active} = 1
          AND (${supplierProducts.trackInventory} = 0
               OR ${supplierProducts.stockQty} - ${supplierProducts.reservedQty} >= ${line.quantity})`,
      )
      .run();
    if (changesOf(result) === 0) {
      // Roll back what we already reserved, then surface a conflict.
      await releaseStockForLines(d1, queue, done, {
        purchaseOrderId: ctx.purchaseOrderId ?? null,
        actorUserId: ctx.actorUserId ?? null,
        note: 'rollback: reservation failed',
      });
      const offer = await getOfferInventory(d1, line.supplierProductId);
      const free = offer ? availableQty(offer) : 0;
      throw httpError(409, 'INSUFFICIENT_STOCK', `Insufficient stock: only ${free} unit(s) available`, {
        supplierProductId: line.supplierProductId,
        available: free,
        requested: line.quantity,
      });
    }
    done.push(line);
    const after = await getOfferInventory(d1, line.supplierProductId);
    if (after) {
      await recordMovement(d1, {
        supplierProductId: line.supplierProductId,
        supplierId: after.supplierId,
        reason: 'order_reserved',
        qtyDelta: 0,
        reservedDelta: line.quantity,
        stockQtyAfter: after.stockQty,
        reservedQtyAfter: after.reservedQty,
        purchaseOrderId: ctx.purchaseOrderId ?? null,
        actorUserId: ctx.actorUserId ?? null,
      });
      await syncAvailability(d1, queue, line.supplierProductId, {
        previous: after.availabilityStatus,
      });
    }
  }
}

/** Releases previously reserved units (cancel / reject / rollback). */
export async function releaseStockForLines(
  d1: D1Database,
  queue: QueueLike | undefined,
  lines: ReserveLine[],
  ctx: { purchaseOrderId?: string | null; actorUserId?: string | null; note?: string | null },
): Promise<void> {
  const db = getDb(d1);
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    await db
      .update(supplierProducts)
      .set({
        reservedQty: sql`MAX(0, ${supplierProducts.reservedQty} - ${line.quantity})`,
        updatedAt: Date.now(),
      })
      .where(eq(supplierProducts.id, line.supplierProductId))
      .run();
    const after = await getOfferInventory(d1, line.supplierProductId);
    if (after) {
      await recordMovement(d1, {
        supplierProductId: line.supplierProductId,
        supplierId: after.supplierId,
        reason: 'order_released',
        qtyDelta: 0,
        reservedDelta: -line.quantity,
        stockQtyAfter: after.stockQty,
        reservedQtyAfter: after.reservedQty,
        purchaseOrderId: ctx.purchaseOrderId ?? null,
        actorUserId: ctx.actorUserId ?? null,
        note: ctx.note ?? null,
      });
      await syncAvailability(d1, queue, line.supplierProductId, {
        previous: after.availabilityStatus,
      });
    }
  }
}

/** Converts reservations into a permanent stock decrement (on delivery). */
export async function commitStockForLines(
  d1: D1Database,
  queue: QueueLike | undefined,
  lines: ReserveLine[],
  ctx: { purchaseOrderId?: string | null; actorUserId?: string | null },
): Promise<void> {
  const db = getDb(d1);
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    await db
      .update(supplierProducts)
      .set({
        stockQty: sql`MAX(0, ${supplierProducts.stockQty} - ${line.quantity})`,
        reservedQty: sql`MAX(0, ${supplierProducts.reservedQty} - ${line.quantity})`,
        updatedAt: Date.now(),
      })
      .where(eq(supplierProducts.id, line.supplierProductId))
      .run();
    const after = await getOfferInventory(d1, line.supplierProductId);
    if (after) {
      await recordMovement(d1, {
        supplierProductId: line.supplierProductId,
        supplierId: after.supplierId,
        reason: 'order_committed',
        qtyDelta: -line.quantity,
        reservedDelta: -line.quantity,
        stockQtyAfter: after.stockQty,
        reservedQtyAfter: after.reservedQty,
        purchaseOrderId: ctx.purchaseOrderId ?? null,
        actorUserId: ctx.actorUserId ?? null,
      });
      await syncAvailability(d1, queue, line.supplierProductId, {
        previous: after.availabilityStatus,
      });
    }
  }
}

export async function listOrderLines(d1: D1Database, poId: string): Promise<ReserveLine[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      supplierProductId: purchaseOrderItems.supplierProductId,
      quantity: purchaseOrderItems.quantity,
    })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, poId))
    .all();
  return rows;
}

type StockStamp = 'stockReservedAt' | 'stockReleasedAt' | 'stockCommittedAt';

/**
 * Sets a stock lifecycle stamp only if unset, returning whether this caller
 * won the race. Makes reserve/release/commit idempotent per order.
 */
async function claimStamp(d1: D1Database, poId: string, stamp: StockStamp): Promise<boolean> {
  const db = getDb(d1);
  const column =
    stamp === 'stockReservedAt'
      ? purchaseOrders.stockReservedAt
      : stamp === 'stockReleasedAt'
        ? purchaseOrders.stockReleasedAt
        : purchaseOrders.stockCommittedAt;
  const result = await db
    .update(purchaseOrders)
    .set({ [stamp]: Date.now() } as Record<string, number>)
    .where(sql`${purchaseOrders.id} = ${poId} AND ${column} IS NULL`)
    .run();
  return changesOf(result) > 0;
}

export const inventoryService = {
  /** Reserve every line of an order exactly once. */
  async reserveForOrder(
    d1: D1Database,
    queue: QueueLike | undefined,
    poId: string,
    lines: ReserveLine[],
    actorUserId: string | null,
  ): Promise<void> {
    if (!(await claimStamp(d1, poId, 'stockReservedAt'))) return;
    try {
      await reserveStockForLines(d1, queue, lines, { purchaseOrderId: poId, actorUserId });
    } catch (err) {
      // Undo the stamp so a retry can reserve again.
      const db = getDb(d1);
      await db
        .update(purchaseOrders)
        .set({ stockReservedAt: null })
        .where(eq(purchaseOrders.id, poId))
        .run();
      throw err;
    }
  },

  /** Release reservations for an order (cancelled / rejected). */
  async releaseForOrder(
    d1: D1Database,
    queue: QueueLike | undefined,
    poId: string,
    actorUserId: string | null,
    note?: string,
  ): Promise<void> {
    const db = getDb(d1);
    const po = await db
      .select({
        stockReservedAt: purchaseOrders.stockReservedAt,
        stockReleasedAt: purchaseOrders.stockReleasedAt,
        stockCommittedAt: purchaseOrders.stockCommittedAt,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .get();
    if (!po || !po.stockReservedAt || po.stockReleasedAt || po.stockCommittedAt) return;
    if (!(await claimStamp(d1, poId, 'stockReleasedAt'))) return;
    const lines = await listOrderLines(d1, poId);
    await releaseStockForLines(d1, queue, lines, {
      purchaseOrderId: poId,
      actorUserId,
      note: note ?? null,
    });
  },

  /** Commit reservations into a stock decrement (delivered). */
  async commitForOrder(
    d1: D1Database,
    queue: QueueLike | undefined,
    poId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const db = getDb(d1);
    const po = await db
      .select({
        stockReservedAt: purchaseOrders.stockReservedAt,
        stockReleasedAt: purchaseOrders.stockReleasedAt,
        stockCommittedAt: purchaseOrders.stockCommittedAt,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .get();
    if (!po || !po.stockReservedAt || po.stockReleasedAt || po.stockCommittedAt) return;
    if (!(await claimStamp(d1, poId, 'stockCommittedAt'))) return;
    const lines = await listOrderLines(d1, poId);
    await commitStockForLines(d1, queue, lines, { purchaseOrderId: poId, actorUserId });
  },

  /**
   * Supplier-driven stock edit. `mode: 'set'` writes an absolute on-hand count,
   * `mode: 'adjust'` applies a signed delta. Enabling a stock count implicitly
   * turns on quantity tracking for the offer.
   */
  async adjustStock(
    d1: D1Database,
    queue: QueueLike | undefined,
    offerId: string,
    input: {
      mode: 'set' | 'adjust';
      quantity: number;
      lowStockThreshold?: number | undefined;
      trackInventory?: boolean | undefined;
      note?: string | undefined;
      actorUserId: string | null;
    },
  ): Promise<OfferInventory> {
    const before = await getOfferInventory(d1, offerId);
    if (!before || before.deletedAt) throw httpError(404, 'NOT_FOUND', 'Offer not found');

    const nextQty =
      input.mode === 'set'
        ? Math.max(0, Math.trunc(input.quantity))
        : Math.max(0, before.stockQty + Math.trunc(input.quantity));
    const track = input.trackInventory ?? true;
    const threshold =
      input.lowStockThreshold !== undefined
        ? Math.max(0, Math.trunc(input.lowStockThreshold))
        : before.lowStockThreshold;

    const db = getDb(d1);
    await db
      .update(supplierProducts)
      .set({
        stockQty: nextQty,
        lowStockThreshold: threshold,
        trackInventory: track,
        updatedAt: Date.now(),
      })
      .where(eq(supplierProducts.id, offerId))
      .run();

    const after = await getOfferInventory(d1, offerId);
    if (after) {
      await recordMovement(d1, {
        supplierProductId: offerId,
        supplierId: after.supplierId,
        reason: input.mode === 'set' ? 'manual_set' : 'manual_adjust',
        qtyDelta: nextQty - before.stockQty,
        reservedDelta: 0,
        stockQtyAfter: after.stockQty,
        reservedQtyAfter: after.reservedQty,
        actorUserId: input.actorUserId,
        note: input.note ?? null,
      });
      await syncAvailability(d1, queue, offerId, { previous: before.availabilityStatus });
    }
    return (await getOfferInventory(d1, offerId)) as OfferInventory;
  },

  async listMovements(d1: D1Database, offerId: string, limit = 50) {
    const db = getDb(d1);
    return db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.supplierProductId, offerId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200))
      .all();
  },

  async listSupplierMovements(d1: D1Database, supplierId: string, limit = 100) {
    const db = getDb(d1);
    return db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.supplierId, supplierId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500))
      .all();
  },

  async listOffersByIds(d1: D1Database, ids: string[]) {
    if (ids.length === 0) return [];
    const db = getDb(d1);
    return db
      .select()
      .from(supplierProducts)
      .where(and(inArray(supplierProducts.id, ids)))
      .all();
  },
};
