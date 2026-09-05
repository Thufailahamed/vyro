import { getDb } from '@vyro/db';
import { businessTypes, businesses, suppliers } from '@vyro/db/schema';
import { eq, and } from 'drizzle-orm';

export type BusinessTypeRow = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
};

export async function listBusinessTypes(d1: D1Database): Promise<BusinessTypeRow[]> {
  const db = getDb(d1);
  return (await db.select().from(businessTypes).all()) as BusinessTypeRow[];
}

export async function getBusinessType(d1: D1Database, id: string): Promise<BusinessTypeRow | null> {
  const db = getDb(d1);
  return ((await db.select().from(businessTypes).where(eq(businessTypes.id, id)).get()) as BusinessTypeRow | undefined) ?? null;
}

export async function createBusinessType(
  d1: D1Database,
  data: { id: string; slug: string; name: string; active: boolean },
): Promise<BusinessTypeRow> {
  const db = getDb(d1);
  await db.insert(businessTypes).values(data).run();
  return data;
}

export async function updateBusinessType(
  d1: D1Database,
  id: string,
  patch: Partial<Pick<BusinessTypeRow, 'name' | 'active'>>,
): Promise<{ before: BusinessTypeRow; after: BusinessTypeRow } | null> {
  const db = getDb(d1);
  const before = await getBusinessType(d1, id);
  if (!before) return null;
  const after: BusinessTypeRow = { ...before, ...patch };
  await db
    .update(businessTypes)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    })
    .where(eq(businessTypes.id, id))
    .run();
  return { before, after };
}

export async function softDeleteBusinessType(d1: D1Database, id: string): Promise<BusinessTypeRow | null> {
  const db = getDb(d1);
  const before = await getBusinessType(d1, id);
  if (!before) return null;
  await db.update(businessTypes).set({ active: false }).where(eq(businessTypes.id, id)).run();
  return { ...before, active: false };
}

export async function businessesUsingType(d1: D1Database, typeId: string): Promise<boolean> {
  const db = getDb(d1);
  const row = db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.businessTypeId, typeId), eq(businesses.status, 'active')))
    .get();
  return !!row;
}

export async function suppliersUsingType(d1: D1Database, typeId: string): Promise<boolean> {
  const db = getDb(d1);
  const row = db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.businessTypeId, typeId), eq(suppliers.status, 'active')))
    .get();
  return !!row;
}
