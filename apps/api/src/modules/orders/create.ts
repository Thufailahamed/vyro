import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, orderEvents, purchaseOrderItems, purchaseOrders, supplierProducts } from '@vyro/db/schema';
import { checkPurchasable, newId, NotificationType, ORDER_STATUS_COPY } from '@vyro/shared';
import { httpError } from '../../lib/errors';
import { insertOrderEvent, insertPo, insertPoItem } from '../purchaseOrders/repository';
import { nextPoNumber } from '../purchaseOrders/service';
import { inventoryService } from '../inventory/service';
import { notifyOrderParties } from '../notifications/dispatcher';
import type { LifecycleEnv } from './lifecycle';

export interface PendingOrderLine {
  supplierProductId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  discountPct?: number;
  lineTotalCents?: number;
}

export interface CreatePendingOrderInput {
  businessId: string;
  supplierId: string;
  createdByUserId: string;
  lines: PendingOrderLine[];
  notes?: string | null;
  /** Tag for the timeline event (e.g. 'whatsapp', 'ai'). */
  source: string;
}

/**
 * Creates a `pending` order the same way checkout does — validated lines,
 * collision-safe PO number, timeline event, atomic stock reservation, party
 * notifications — for order sources that don't go through the cart
 * (conversational ordering, AI recommendations).
 */
export async function createPendingOrder(env: LifecycleEnv, input: CreatePendingOrderInput): Promise<{ poId: string; poNumber: string }> {
  const d1 = env.DB;
  const db = getDb(d1);
  if (input.lines.length === 0) throw httpError(400, 'VALIDATION_ERROR', 'Order has no lines');
  const biz = await db.select().from(businesses).where(eq(businesses.id, input.businessId)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  const offers = await db
    .select()
    .from(supplierProducts)
    .where(inArray(supplierProducts.id, input.lines.map((l) => l.supplierProductId)))
    .all();
  const byId = new Map(offers.map((o) => [o.id, o]));
  for (const l of input.lines) {
    const o = byId.get(l.supplierProductId);
    if (!o || o.deletedAt || !o.active || o.supplierId !== input.supplierId) {
      throw httpError(409, 'CONFLICT', `${l.productName} is no longer available from this supplier`);
    }
    const verdict = checkPurchasable(o, l.quantity);
    if (!verdict.ok) throw httpError(409, verdict.code, `${l.productName}: ${verdict.message}`);
  }

  const poId = newId();
  const poNumber = await nextPoNumber(d1, input.businessId);
  const now = Date.now();
  const rows = input.lines.map((l) => ({
    ...l,
    lineTotalCents: l.lineTotalCents ?? l.unitPriceCents * l.quantity,
  }));
  const subtotal = rows.reduce((s, r) => s + r.lineTotalCents, 0);

  await insertPo(d1, {
    id: poId,
    poNumber,
    businessId: input.businessId,
    supplierId: input.supplierId,
    status: 'pending',
    subtotalCents: subtotal,
    deliveryFeeCents: 0,
    totalCents: subtotal,
    currency: 'LKR',
    deliveryAddress: biz.address,
    deliveryCity: biz.city,
    deliveryDistrict: biz.district,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  for (const r of rows) {
    await insertPoItem(d1, {
      id: newId(),
      purchaseOrderId: poId,
      supplierProductId: r.supplierProductId,
      productNameSnapshot: r.productName,
      unitPriceCents: r.unitPriceCents,
      unitPriceCentsSnapshot: r.unitPriceCents,
      discountPctSnapshot: r.discountPct ?? 0,
      quantity: r.quantity,
      lineTotalCents: r.lineTotalCents,
    });
  }
  await insertOrderEvent(d1, {
    purchaseOrderId: poId,
    actorUserId: input.createdByUserId,
    fromStatus: null,
    toStatus: 'pending',
    reason: input.source,
    metadata: { poNumber, source: input.source },
  });

  try {
    await inventoryService.reserveForOrder(
      d1,
      env.NOTIFICATIONS_QUEUE,
      poId,
      rows.map((r) => ({ supplierProductId: r.supplierProductId, quantity: r.quantity })),
      input.createdByUserId,
    );
  } catch (err) {
    await discardPendingOrder(d1, poId);
    throw err;
  }

  try {
    await notifyOrderParties(
      d1,
      env.NOTIFICATIONS_QUEUE,
      { id: poId, poNumber, businessId: input.businessId, supplierId: input.supplierId },
      {
        type: NotificationType.ORDER_PLACED,
        title: `Order ${poNumber} placed`,
        body: ORDER_STATUS_COPY.pending!.buyer,
        supplierTitle: `New order ${poNumber}`,
        supplierBody: ORDER_STATUS_COPY.pending!.supplier,
        supplierLink: `/supplier/orders/${poId}`,
        excludeUserId: input.createdByUserId,
      },
    );
  } catch {
    /* best-effort */
  }
  return { poId, poNumber };
}

/** Removes a just-created order that never became real (reservation failed). */
export async function discardPendingOrder(d1: D1Database, poId: string): Promise<void> {
  const db = getDb(d1);
  try {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, poId));
    await db.delete(orderEvents).where(eq(orderEvents.purchaseOrderId, poId));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, poId));
  } catch (err) {
    console.error('[orders.create] discard failed', { poId, err });
  }
}
