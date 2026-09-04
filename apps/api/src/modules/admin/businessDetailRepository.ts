import { eq, and, ne, desc } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, businessMembers, users, purchaseOrders } from '@vyro/db/schema';

export type BusinessDetail = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  members: Array<{ userId: string; role: string; email: string | null }>;
  orderCount: number;
  recentOrders: Array<{ id: string; status: string; totalCents: number; createdAt: number }>;
};

export async function getBusinessDetailForAdmin(
  d1: D1Database,
  id: string,
): Promise<BusinessDetail | null> {
  const db = getDb(d1);
  const business = await db.select().from(businesses).where(eq(businesses.id, id)).get();
  if (!business) return null;

  const members = await db
    .select({
      userId: businessMembers.userId,
      role: businessMembers.role,
      email: users.email,
    })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(eq(businessMembers.businessId, id))
    .all();

  const recentOrders = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      totalCents: purchaseOrders.totalCents,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.businessId, id))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(20)
    .all();

  const all = await db
    .select({ c: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.businessId, id), ne(purchaseOrders.status, 'cancelled')))
    .all();

  return {
    id: business.id,
    name: business.name,
    status: business.status,
    createdAt: business.createdAt,
    members,
    orderCount: all.length,
    recentOrders,
  };
}
