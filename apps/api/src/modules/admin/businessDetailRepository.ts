import { eq, and, ne, desc } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, businessMembers, users, purchaseOrders } from '@vyro/db/schema';

export type BusinessDetail = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  profile: {
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    district: string;
    countryCode: string;
    description: string | null;
    taxId: string | null;
    kycLevel: string;
    kycVerifiedAt: number | null;
  };
  members: Array<{ userId: string; role: string; email: string | null }>;
  orderCount: number;
  /** Sum of non-cancelled PO totals. */
  lifetimeSpendCents: number;
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
    .select({ c: purchaseOrders.id, t: purchaseOrders.totalCents })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.businessId, id), ne(purchaseOrders.status, 'cancelled')))
    .all();

  return {
    id: business.id,
    name: business.name,
    status: business.status,
    createdAt: business.createdAt,
    profile: {
      contactPerson: business.contactPerson,
      email: business.email,
      phone: business.phone,
      address: business.address,
      city: business.city,
      district: business.district,
      countryCode: business.countryCode,
      description: business.description ?? null,
      taxId: business.taxId ?? null,
      kycLevel: business.kycLevel,
      kycVerifiedAt: business.kycVerifiedAt ?? null,
    },
    members,
    orderCount: all.length,
    lifetimeSpendCents: all.reduce((n, r) => n + Number(r.t ?? 0), 0),
    recentOrders,
  };
}
