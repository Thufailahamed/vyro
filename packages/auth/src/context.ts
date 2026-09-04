import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users, businessMembers, supplierMembers } from '@vyro/db/schema';
import type { SessionContext } from './types';

export async function loadSessionContext(
  d1: D1Database,
  userId: string,
): Promise<SessionContext | null> {
  const db = getDb(d1);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.deletedAt) return null;

  const biz = await db
    .select({ id: businessMembers.businessId, role: businessMembers.role })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, userId), eq(businessMembers.status, 'active')))
    .all();

  const sup = await db
    .select({ id: supplierMembers.supplierId, role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.userId, userId), eq(supplierMembers.status, 'active')))
    .all();

  return {
    userId: user.id,
    email: user.email,
    isAdmin: user.isPlatformAdmin,
    businesses: biz,
    suppliers: sup,
  };
}
