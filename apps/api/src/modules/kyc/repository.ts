import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { kycReviews, supplierMembers, suppliers } from '@vyro/db/schema';
import type { KycRow } from '../admin/trustSafety/kycRepository';

export async function findMemberSupplier(d1: D1Database, supplierId: string, userId: string) {
  const db = getDb(d1);
  const row = await db
    .select({ id: suppliers.id, verificationStatus: suppliers.verificationStatus })
    .from(suppliers)
    .innerJoin(supplierMembers, eq(supplierMembers.supplierId, suppliers.id))
    .where(
      and(
        eq(suppliers.id, supplierId),
        eq(supplierMembers.userId, userId),
        eq(supplierMembers.status, 'active'),
        isNull(suppliers.deletedAt),
      ),
    )
    .get();
  return row ?? null;
}

export async function findMyKyc(d1: D1Database, userId: string): Promise<KycRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(kycReviews)
    .where(eq(kycReviews.userId, userId))
    .orderBy(desc(kycReviews.createdAt))
    .limit(1)
    .get()) as unknown as KycRow | undefined;
  return row ?? null;
}
