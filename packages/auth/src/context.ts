import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users, businessMembers, supplierMembers, businesses, suppliers } from '@vyro/db/schema';
import type { SessionContext } from './types';

export async function loadSessionContext(
  d1: D1Database,
  userId: string,
): Promise<SessionContext | null> {
  const db = getDb(d1);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.deletedAt) return null;

  const biz = await db
    .select({
      id: businessMembers.businessId,
      businessId: businessMembers.businessId,
      role: businessMembers.role,
      name: businesses.name,
      businessName: businesses.name,
    })
    .from(businessMembers)
    .innerJoin(businesses, eq(businessMembers.businessId, businesses.id))
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.status, 'active'),
        isNull(businesses.deletedAt),
      ),
    )
    .all();

  const sup = await db
    .select({
      id: supplierMembers.supplierId,
      supplierId: supplierMembers.supplierId,
      role: supplierMembers.role,
      name: suppliers.name,
      supplierName: suppliers.name,
    })
    .from(supplierMembers)
    .innerJoin(suppliers, eq(supplierMembers.supplierId, suppliers.id))
    .where(
      and(
        eq(supplierMembers.userId, userId),
        eq(supplierMembers.status, 'active'),
        isNull(suppliers.deletedAt),
      ),
    )
    .all();

  return {
    userId: user.id,
    email: user.email,
    isAdmin: user.isPlatformAdmin,
    businesses: biz,
    suppliers: sup,
  };
}
