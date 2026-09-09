import { and, desc, eq, lt } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { deliveries, purchaseOrders, supplierMembers } from '@vyro/db/schema';

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
): Promise<DeliveryListItem[]> {
  const db = getDb(d1);
  const conds = [eq(purchaseOrders.supplierId, supplierId)];
  if (cursor) conds.push(lt(deliveries.createdAt, cursor));
  if (status) conds.push(eq(deliveries.status, status as any));
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
    })
    .from(deliveries)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, deliveries.purchaseOrderId))
    .where(and(...conds))
    .orderBy(desc(deliveries.createdAt))
    .limit(50)
    .all();
  return rows;
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
  if (!m || !['owner', 'manager', 'sales', 'operations'].includes(m.role)) {
    throw new Error('FORBIDDEN');
  }
}
