import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders, purchaseOrderItems, orderEvents, suppliers } from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import type { OrderStatus, ActorRole } from '@vyro/shared';

export async function insertPo(
  d1: D1Database,
  row: {
    id: string;
    poNumber: string;
    businessId: string;
    supplierId: string;
    status: string;
    subtotalCents: number;
    deliveryFeeCents: number;
    totalCents: number;
    currency: string;
    deliveryAddress: string;
    deliveryCity: string;
    deliveryDistrict: string;
    notes: string | null;
    createdByUserId: string;
    createdAt: number;
    updatedAt: number;
  },
) {
  const db = getDb(d1);
  await db.insert(purchaseOrders).values(row);
}

export async function insertPoItem(
  d1: D1Database,
  row: {
    id: string;
    purchaseOrderId: string;
    supplierProductId: string;
    productNameSnapshot: string;
    unitPriceCents: number;
    unitPriceCentsSnapshot: number;
    discountPctSnapshot: number;
    quantity: number;
    lineTotalCents: number;
  },
) {
  const db = getDb(d1);
  await db.insert(purchaseOrderItems).values(row);
}

export async function insertOrderEvent(
  d1: D1Database,
  row: { purchaseOrderId: string; actorUserId: string | null; fromStatus: string | null; toStatus: string; reason: string | null; metadata: unknown },
) {
  const db = getDb(d1);
  await db.insert(orderEvents).values({
    id: newId(),
    purchaseOrderId: row.purchaseOrderId,
    actorUserId: row.actorUserId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    reason: row.reason,
    metadata: row.metadata != null ? JSON.stringify(row.metadata) : null,
    createdAt: Date.now(),
  });
}

export async function listPosForBusiness(d1: D1Database, businessId: string) {
  const db = getDb(d1);
  return db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      businessId: purchaseOrders.businessId,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
      subtotalCents: purchaseOrders.subtotalCents,
      deliveryFeeCents: purchaseOrders.deliveryFeeCents,
      totalCents: purchaseOrders.totalCents,
      currency: purchaseOrders.currency,
      deliveryAddress: purchaseOrders.deliveryAddress,
      deliveryCity: purchaseOrders.deliveryCity,
      deliveryDistrict: purchaseOrders.deliveryDistrict,
      notes: purchaseOrders.notes,
      rejectionReason: purchaseOrders.rejectionReason,
      cancelledReason: purchaseOrders.cancelledReason,
      createdByUserId: purchaseOrders.createdByUserId,
      acceptedAt: purchaseOrders.acceptedAt,
      rejectedAt: purchaseOrders.rejectedAt,
      preparedAt: purchaseOrders.preparedAt,
      readyAt: purchaseOrders.readyAt,
      dispatchedAt: purchaseOrders.dispatchedAt,
      deliveredAt: purchaseOrders.deliveredAt,
      completedAt: purchaseOrders.completedAt,
      cancelledAt: purchaseOrders.cancelledAt,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      supplierName: suppliers.name,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.businessId, businessId))
    .orderBy(desc(purchaseOrders.createdAt))
    .all();
}

export async function listPosForSupplier(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.supplierId, supplierId)).all();
}

export async function findPo(d1: D1Database, id: string) {
  const db = getDb(d1);
  return (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get()) ?? null;
}

export async function listPoItems(d1: D1Database, poId: string) {
  const db = getDb(d1);
  return db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, poId)).all();
}

export async function listPoEvents(d1: D1Database, poId: string) {
  const db = getDb(d1);
  return db.select().from(orderEvents).where(eq(orderEvents.purchaseOrderId, poId)).all();
}

export async function updatePoStatus(d1: D1Database, poId: string, status: string, timestamps: Record<string, number | null>) {
  const db = getDb(d1);
  await db
    .update(purchaseOrders)
    .set({ status, ...timestamps, updatedAt: Date.now() })
    .where(eq(purchaseOrders.id, poId));
}

export type TransitionActor = { role: ActorRole; userId: string };

export interface TransitionInput {
  poId: string;
  to: OrderStatus;
  actor: TransitionActor;
  reason?: string | null;
}

export { and };
