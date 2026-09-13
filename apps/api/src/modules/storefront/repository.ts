import { and, asc, eq, isNull, like } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, supplierProducts } from '@vyro/db/schema';

export async function findBySlug(d1: D1Database, slug: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.slug, slug))
    .get()) as any;
}

export async function listPublishedOffersBySupplierId(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.active, true as never),
        isNull(supplierProducts.deletedAt),
      ),
    )
    .orderBy(asc(supplierProducts.createdAt))
    .all()) as any[];
}

export async function updateSupplierSlug(d1: D1Database, supplierId: string, slug: string) {
  const db = getDb(d1);
  return (await db
    .update(suppliers)
    .set({ slug })
    .where(eq(suppliers.id, supplierId))
    .returning()
    .get()) as any;
}

export async function existingSlugsStartingWith(d1: D1Database, prefix: string): Promise<string[]> {
  const db = getDb(d1);
  return (await db
    .select({ slug: suppliers.slug })
    .from(suppliers)
    .where(like(suppliers.slug, `${prefix}%`))
    .all()) as any[];
}
