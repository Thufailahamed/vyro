import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, purchaseOrders, supplierMembers } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';

export type CustomerSummary = {
  businessId: string;
  name: string;
  totalOrders: number;
  totalCents: number;
  lastOrderAt: number;
};

export async function ensureSupplierMember(
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
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
}

export async function listCustomersForSupplier(
  d1: D1Database,
  supplierId: string,
): Promise<CustomerSummary[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      businessId: purchaseOrders.businessId,
      name: businesses.name,
      totalOrders: sql<number>`COUNT(${purchaseOrders.id})`,
      totalCents: sql<number>`COALESCE(SUM(${purchaseOrders.totalCents}), 0)`,
      lastOrderAt: sql<number>`MAX(${purchaseOrders.createdAt})`,
    })
    .from(purchaseOrders)
    .innerJoin(businesses, eq(businesses.id, purchaseOrders.businessId))
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        sql`${purchaseOrders.status} <> 'cancelled'`,
      ),
    )
    .groupBy(purchaseOrders.businessId, businesses.name)
    .orderBy(desc(sql`MAX(${purchaseOrders.createdAt})`))
    .all();
  return rows.map((r) => ({
    businessId: r.businessId,
    name: r.name,
    totalOrders: Number(r.totalOrders),
    totalCents: Number(r.totalCents),
    lastOrderAt: Number(r.lastOrderAt),
  }));
}
