import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { categories } from '@vyro/db/schema';

export type SupplierType = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
};

export async function listRootCategories(d1: D1Database): Promise<SupplierType[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(and(eq(categories.active, true), isNull(categories.parentId)))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all();
  return rows;
}
