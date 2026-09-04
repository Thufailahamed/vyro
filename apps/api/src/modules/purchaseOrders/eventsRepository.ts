import { asc, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { orderEvents, purchaseOrders } from '@vyro/db/schema';

export type PurchaseOrderEvent = {
  id: string;
  purchaseOrderId: string;
  actorUserId: string | null;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  metadata: string | null;
  createdAt: number;
};

export async function findPurchaseOrder(
  d1: D1Database,
  id: string,
): Promise<{ id: string; supplierId: string; businessId: string } | null> {
  const db = getDb(d1);
  const row = await db
    .select({
      id: purchaseOrders.id,
      supplierId: purchaseOrders.supplierId,
      businessId: purchaseOrders.businessId,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .get();
  return row ?? null;
}

export async function listEventsForPo(
  d1: D1Database,
  poId: string,
): Promise<PurchaseOrderEvent[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      id: orderEvents.id,
      purchaseOrderId: orderEvents.purchaseOrderId,
      actorUserId: orderEvents.actorUserId,
      fromStatus: orderEvents.fromStatus,
      toStatus: orderEvents.toStatus,
      reason: orderEvents.reason,
      metadata: orderEvents.metadata,
      createdAt: orderEvents.createdAt,
    })
    .from(orderEvents)
    .where(eq(orderEvents.purchaseOrderId, poId))
    .orderBy(asc(orderEvents.createdAt))
    .all();
  return rows;
}
