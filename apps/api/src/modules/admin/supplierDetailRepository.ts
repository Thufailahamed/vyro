import { eq, and, isNull, notInArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, supplierMembers, users, supplierProducts, purchaseOrders } from '@vyro/db/schema';

export type SupplierDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  verificationStatus: string;
  createdAt: number;
  members: Array<{ userId: string; role: string; email: string | null }>;
  offerCount: number;
  activePoCount: number;
};

export async function getSupplierDetailForAdmin(
  d1: D1Database,
  id: string,
): Promise<SupplierDetail | null> {
  const db = getDb(d1);
  const supplier = await db.select().from(suppliers).where(eq(suppliers.id, id)).get();
  if (!supplier) return null;

  const members = await db
    .select({
      userId: supplierMembers.userId,
      role: supplierMembers.role,
      email: users.email,
    })
    .from(supplierMembers)
    .innerJoin(users, eq(users.id, supplierMembers.userId))
    .where(eq(supplierMembers.supplierId, id))
    .all();

  const offerRow = await db
    .select({ c: supplierProducts.id })
    .from(supplierProducts)
    .where(and(eq(supplierProducts.supplierId, id), isNull(supplierProducts.deletedAt)))
    .all();
  const poRow = await db
    .select({ c: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.supplierId, id), notInArray(purchaseOrders.status, ['cancelled', 'rejected'])))
    .all();

  return {
    id: supplier.id,
    name: supplier.name,
    description: supplier.description ?? null,
    status: supplier.status,
    verificationStatus: supplier.verificationStatus,
    createdAt: supplier.createdAt,
    members,
    offerCount: offerRow.length,
    activePoCount: poRow.length,
  };
}
