import { getDb } from '@vyro/db';
import { categories, products } from '@vyro/db/schema';
import { eq, asc, and, isNull } from 'drizzle-orm';

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  active: boolean;
  sortOrder: number;
};

export async function listCategoriesTree(d1: D1Database): Promise<CategoryRow[]> {
  const db = getDb(d1);
  return (await db.select().from(categories).orderBy(asc(categories.sortOrder)).all()) as CategoryRow[];
}

export async function getCategory(d1: D1Database, id: string): Promise<CategoryRow | null> {
  const db = getDb(d1);
  return ((await db.select().from(categories).where(eq(categories.id, id)).get()) as CategoryRow | undefined) ?? null;
}

export async function createCategory(
  d1: D1Database,
  data: { id: string; slug: string; name: string; parentId: string | null; sortOrder: number },
): Promise<CategoryRow> {
  const db = getDb(d1);
  await db.insert(categories).values({ ...data, active: true }).run();
  return { ...data, active: true };
}

export async function updateCategory(
  d1: D1Database,
  id: string,
  patch: Partial<Pick<CategoryRow, 'name' | 'parentId' | 'sortOrder' | 'active'>>,
): Promise<{ before: CategoryRow; after: CategoryRow } | null> {
  const db = getDb(d1);
  const before = await getCategory(d1, id);
  if (!before) return null;
  const after: CategoryRow = { ...before, ...patch };
  await db
    .update(categories)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    })
    .where(eq(categories.id, id))
    .run();
  return { before, after };
}

export async function softDeleteCategory(d1: D1Database, id: string): Promise<CategoryRow | null> {
  const db = getDb(d1);
  const before = await getCategory(d1, id);
  if (!before) return null;
  await db.update(categories).set({ active: false }).where(eq(categories.id, id)).run();
  return { ...before, active: false };
}

export async function hasActiveChildren(d1: D1Database, parentId: string): Promise<boolean> {
  const db = getDb(d1);
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.parentId, parentId), eq(categories.active, true)))
    .get();
  return !!row;
}

export async function isDescendantOf(d1: D1Database, candidate: string, ancestor: string): Promise<boolean> {
  const db = getDb(d1);
  let current: string | null = candidate;
  while (current) {
    if (current === ancestor) return true;
    const row: { parentId: string | null } | null = ((await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, current))
      .get()) ?? null) as { parentId: string | null } | null;
    current = row?.parentId ?? null;
  }
  return false;
}

export async function productsInCategory(d1: D1Database, categoryId: string): Promise<number> {
  const db = getDb(d1);
  const row = (await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.categoryId, categoryId), eq(products.active, true)))
    .get()) ?? null;
  return row ? 1 : 0;
}

// Re-export for callers
export { and, eq, isNull };
