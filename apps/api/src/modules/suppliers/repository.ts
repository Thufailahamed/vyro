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
