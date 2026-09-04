import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { products, productImages, categories } from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export async function listProducts(d1: D1Database, opts: { categoryId?: string | undefined; limit?: number | undefined }) {
  const db = getDb(d1);
  const conds: any[] = [isNull(products.deletedAt)];
  if (opts.categoryId) conds.push(eq(products.categoryId, opts.categoryId));
  return db.select().from(products).where(and(...conds)).limit(opts.limit ?? 50).all();
}

export async function findProductById(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select().from(products).where(and(eq(products.id, id), isNull(products.deletedAt))).get() ?? null;
}

export async function findCategoryById(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select().from(categories).where(eq(categories.id, id)).get() ?? null;
}

export async function createProduct(
  d1: D1Database,
  input: { name: string; description?: string | undefined; categoryId: string; brand?: string | undefined; unit: string; packSize?: string | undefined },
) {
  const db = getDb(d1);
  const id = newId();
  const now = Date.now();
  await db.insert(products).values({
    id,
    name: input.name,
    description: input.description ?? null,
    categoryId: input.categoryId,
    brand: input.brand ?? null,
    unit: input.unit,
    packSize: input.packSize ?? null,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateProduct(
  d1: D1Database,
  id: string,
  input: {
    name?: string | undefined;
    description?: string | null | undefined;
    categoryId?: string | undefined;
    brand?: string | null | undefined;
    unit?: string | undefined;
    packSize?: string | null | undefined;
    active?: boolean | undefined;
  },
) {
  const db = getDb(d1);
  await db.update(products).set({ ...input, updatedAt: Date.now() }).where(eq(products.id, id));
}

export async function softDeleteProduct(d1: D1Database, id: string) {
  const db = getDb(d1);
  await db.update(products).set({ deletedAt: Date.now(), active: false, updatedAt: Date.now() }).where(eq(products.id, id));
}

export async function listProductImages(d1: D1Database, productId: string) {
  const db = getDb(d1);
  return db.select().from(productImages).where(eq(productImages.productId, productId)).all();
}

export async function addProductImage(
  d1: D1Database,
  productId: string,
  input: { r2Key: string; sortOrder?: number | undefined; altText?: string | undefined },
) {
  const db = getDb(d1);
  const id = newId();
  await db.insert(productImages).values({
    id,
    productId,
    r2Key: input.r2Key,
    sortOrder: input.sortOrder ?? 0,
    altText: input.altText ?? null,
  });
  return id;
}

export async function removeProductImage(d1: D1Database, imageId: string) {
  const db = getDb(d1);
  await db.delete(productImages).where(eq(productImages.id, imageId));
}
