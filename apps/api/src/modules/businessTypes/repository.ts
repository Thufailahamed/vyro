import { asc, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businessTypes } from '@vyro/db/schema';

export type BusinessType = {
  id: string;
  slug: string;
  name: string;
};

export async function listActiveBusinessTypes(d1: D1Database): Promise<BusinessType[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      id: businessTypes.id,
      slug: businessTypes.slug,
      name: businessTypes.name,
    })
    .from(businessTypes)
    .where(eq(businessTypes.active, true))
    .orderBy(asc(businessTypes.name))
    .all();
  return rows;
}
