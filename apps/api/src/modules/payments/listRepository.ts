import { and, desc, eq, gt } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { payments, purchaseOrders, supplierMembers } from '@vyro/db/schema';

export type PaymentListItem = {
  id: string;
  purchaseOrderId: string;
  supplierId: string;
  amountCents: number;
  status: string;
  createdAt: number;
};

export async function listPaymentsForSupplier(
  d1: D1Database,
  supplierId: string,
  cursor: number | undefined,
  status: string | undefined,
): Promise<PaymentListItem[]> {
  const db = getDb(d1);
  const conds = [eq(purchaseOrders.supplierId, supplierId)];
  if (cursor) conds.push(gt(payments.createdAt, cursor));
  if (status) conds.push(eq(payments.status, status as any));
  const rows = await db
    .select({
      id: payments.id,
      purchaseOrderId: payments.purchaseOrderId,
      supplierId: purchaseOrders.supplierId,
      amountCents: payments.amountCents,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, payments.purchaseOrderId))
    .where(and(...conds))
    .orderBy(desc(payments.createdAt))
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
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (!m || !['owner', 'manager', 'sales'].includes(m.role)) {
    throw new Error('FORBIDDEN');
  }
}
