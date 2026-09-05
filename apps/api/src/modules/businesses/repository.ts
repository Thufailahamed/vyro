import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, businessMembers, businessTypes } from '@vyro/db/schema';

export async function listBusinessTypes(d1: D1Database) {
  const db = getDb(d1);
  return db.select().from(businessTypes).where(eq(businessTypes.active, true)).all();
}

export async function findBusinessTypeBySlug(d1: D1Database, slug: string) {
  const db = getDb(d1);
  return db.select().from(businessTypes).where(eq(businessTypes.slug, slug)).get();
}

export async function insertBusiness(
  d1: D1Database,
  data: {
    id: string;
    name: string;
    businessTypeId: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    district: string;
    description: string | null;
    createdAt: number;
    updatedAt: number;
  },
) {
  const db = getDb(d1);
  await db.insert(businesses).values({ ...data, status: 'active', deletedAt: null });
}

export async function insertOwnerMember(
  d1: D1Database,
  id: string,
  businessId: string,
  userId: string,
  createdAt: number,
) {
  const db = getDb(d1);
  await db.insert(businessMembers).values({
    id,
    businessId,
    userId,
    role: 'owner',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  });
}

export async function listMyBusinesses(d1: D1Database, userId: string) {
  const db = getDb(d1);
  return db
    .select({
      id: businesses.id,
      name: businesses.name,
      city: businesses.city,
      district: businesses.district,
    })
    .from(businesses)
    .innerJoin(businessMembers, eq(businessMembers.businessId, businesses.id))
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.status, 'active'),
        isNull(businesses.deletedAt),
      ),
    )
    .all();
}

export async function findBusinessForUser(
  d1: D1Database,
  businessId: string,
  userId: string,
) {
  const db = getDb(d1);
  const row = await db
    .select({ business: businesses })
    .from(businesses)
    .innerJoin(businessMembers, eq(businessMembers.businessId, businesses.id))
    .where(
      and(
        eq(businesses.id, businessId),
        eq(businessMembers.userId, userId),
        eq(businessMembers.status, 'active'),
        isNull(businesses.deletedAt),
      ),
    )
    .get();
  return row?.business ?? null;
}
