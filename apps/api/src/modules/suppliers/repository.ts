import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, supplierMembers } from '@vyro/db/schema';

export async function insertSupplier(
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
  await db.insert(suppliers).values({
    ...data,
    verificationStatus: 'pending',
    status: 'active',
    deletedAt: null,
  });
}

export async function insertOwnerSupplierMember(
  d1: D1Database,
  id: string,
  supplierId: string,
  userId: string,
  createdAt: number,
) {
  const db = getDb(d1);
  await db.insert(supplierMembers).values({
    id,
    supplierId,
    userId,
    role: 'owner',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  });
}

export async function listMySuppliers(d1: D1Database, userId: string) {
  const db = getDb(d1);
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      city: suppliers.city,
      district: suppliers.district,
      verificationStatus: suppliers.verificationStatus,
    })
    .from(suppliers)
    .innerJoin(supplierMembers, eq(supplierMembers.supplierId, suppliers.id))
    .where(
      and(
        eq(supplierMembers.userId, userId),
        eq(supplierMembers.status, 'active'),
        isNull(suppliers.deletedAt),
      ),
    )
    .all();
}

export async function findSupplierById(d1: D1Database, id: string) {
  const db = getDb(d1);
  return (
    db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
      .get() ?? null
  );
}

export async function setSupplierStatus(
  d1: D1Database,
  id: string,
  status: 'active' | 'suspended',
): Promise<void> {
  const db = getDb(d1);
  await db.update(suppliers).set({ status, updatedAt: Date.now() }).where(eq(suppliers.id, id)).run();
}

export type SupplierVerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

/**
 * Moves a supplier through KYB verification.
 *
 * Guarded with `expectStatus` so two admins reviewing the same supplier cannot
 * both apply a decision — the loser gets 0 changed rows and the route turns that
 * into a 409 rather than silently overwriting the first decision.
 */
export async function setSupplierVerification(
  d1: D1Database,
  id: string,
  status: SupplierVerificationStatus,
  expectStatus?: SupplierVerificationStatus,
): Promise<boolean> {
  const db = getDb(d1);
  const where = expectStatus
    ? and(eq(suppliers.id, id), eq(suppliers.verificationStatus, expectStatus))
    : eq(suppliers.id, id);
  const res = await db
    .update(suppliers)
    .set({ verificationStatus: status, updatedAt: Date.now() })
    .where(where)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * Finds the supplier org a user belongs to (first active membership).
 * Used to mirror KYC decisions onto `suppliers.verificationStatus`.
 */
export async function findSupplierIdByMemberUserId(
  d1: D1Database,
  userId: string,
): Promise<string | null> {
  const db = getDb(d1);
  const row = await db
    .select({ supplierId: supplierMembers.supplierId })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.userId, userId), eq(supplierMembers.status, 'active')))
    .limit(1)
    .get();
  return row?.supplierId ?? null;
}
