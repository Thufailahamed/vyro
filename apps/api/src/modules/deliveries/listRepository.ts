import { and, desc, eq, lt } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { deliveries, purchaseOrders, supplierMembers } from '@vyro/db/schema';
import { SUPPLIER_ROLES } from '@vyro/auth';

export type DeliveryListItem = {
  id: string;
  purchaseOrderId: string;
  supplierId: string;
  status: string;
  estimatedAt: number | null;
  deliveredAt: number | null;
  driverName: string | null;
  driverPhone: string | null;
};

export async function listDeliveriesForSupplier(
  d1: D1Database,
  supplierId: string,
  cursor: number | undefined,
  status: string | undefined,
  limit = 50,
): Promise<{ items: DeliveryListItem[]; nextCursor: number | null }> {
  const db = getDb(d1);
  const conds = [eq(purchaseOrders.supplierId, supplierId)];
  if (cursor) conds.push(lt(deliveries.createdAt, cursor));
  if (status) conds.push(eq(deliveries.status, status as any));
  const capped = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  const rows = await db
    .select({
      id: deliveries.id,
      purchaseOrderId: deliveries.purchaseOrderId,
      supplierId: purchaseOrders.supplierId,
      status: deliveries.status,
      estimatedAt: deliveries.estimatedAt,
      deliveredAt: deliveries.deliveredAt,
      driverName: deliveries.driverName,
      driverPhone: deliveries.driverPhone,
      createdAt: deliveries.createdAt,
    })
    .from(deliveries)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, deliveries.purchaseOrderId))
    .where(and(...conds))
    .orderBy(desc(deliveries.createdAt))
    .limit(capped + 1)
    .all();
  const hasMore = rows.length > capped;
  const items = rows.slice(0, capped);
  // Keyset cursor for the next page (the client could not page before —
  // the route never returned a cursor).
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? last.createdAt : null,
  };
}

export async function requireSupplierMember(
  d1: D1Database,
  supplierId: string,
  userId: string,
): Promise<void> {
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId), eq(supplierMembers.status, 'active')))
    .get();
  if (!m || !SUPPLIER_ROLES.includes(m.role as (typeof SUPPLIER_ROLES)[number])) {
    throw new Error('FORBIDDEN');
  }
}
