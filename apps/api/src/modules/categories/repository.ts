import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { categories } from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export async function listCategories(d1: D1Database) {
  const db = getDb(d1);
  return db.select().from(categories).all();
}

export async function findCategoryById(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select().from(categories).where(eq(categories.id, id)).get() ?? null;
}

export async function createCategory(
  d1: D1Database,
  input: { slug: string; name: string; parentId?: string | undefined; sortOrder?: number | undefined },
) {
  const db = getDb(d1);
  const id = newId();
  await db.insert(categories).values({
    id,
    slug: input.slug,
    name: input.name,
    parentId: input.parentId ?? null,
    sortOrder: input.sortOrder ?? 0,
    active: true,
  });
  return id;
}

export async function updateCategory(
  d1: D1Database,
  id: string,
  input: { name?: string | undefined; active?: boolean | undefined; sortOrder?: number | undefined },
) {
  const db = getDb(d1);
  await db.update(categories).set(input).where(eq(categories.id, id));
}
