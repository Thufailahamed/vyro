import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { products, productImages, categories, supplierProducts } from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export async function listProducts(d1: D1Database, opts: { categoryId?: string | undefined; limit?: number | undefined }) {
  const db = getDb(d1);
  // Only live catalog rows: an admin-deactivated product must not stay
  // browsable (the AI upload path relies on `active = false` to hold a
  // product back until an admin approves it).
  const conds: any[] = [isNull(products.deletedAt), eq(products.active, true as never)];
  if (opts.categoryId) conds.push(eq(products.categoryId, opts.categoryId));
  // Newest first: without an ORDER BY SQLite returns rows in insertion order,
  // so a LIMIT kept the OLDEST products and dropped the newest ones.
  return db.select().from(products).where(and(...conds)).orderBy(desc(products.createdAt)).limit(opts.limit ?? 50).all();
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
  input: {
    name: string;
    description?: string | undefined;
    categoryId: string;
    brand?: string | undefined;
    unit: string;
    packSize?: string | undefined;
    hsCode?: string | undefined;
    countryOfOrigin?: string | undefined;
    createdByUserId?: string | null | undefined;
  },
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
    hsCode: input.hsCode ?? null,
    countryOfOrigin: input.countryOfOrigin ? input.countryOfOrigin.toUpperCase() : null,
    active: true,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * True when the supplier has an offer on the product. Used to authorise
 * supplier writes to a shared catalog row.
 */
export async function hasOfferForProduct(d1: D1Database, supplierId: string, productId: string) {
  const db = getDb(d1);
  const row = await db
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .where(and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.productId, productId)))
    .get();
  return !!row;
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
    hsCode?: string | null | undefined;
    countryOfOrigin?: string | null | undefined;
  },
) {
  const db = getDb(d1);
  const patch: Record<string, unknown> = { ...input, updatedAt: Date.now() };
  if (typeof input.countryOfOrigin === 'string') {
    patch.countryOfOrigin = input.countryOfOrigin.toUpperCase();
  }
  await db.update(products).set(patch).where(eq(products.id, id));
}

export async function softDeleteProduct(d1: D1Database, id: string) {
  const db = getDb(d1);
  await db.update(products).set({ deletedAt: Date.now(), active: false, updatedAt: Date.now() }).where(eq(products.id, id));
}

export async function listProductImages(d1: D1Database, productId: string) {
  const db = getDb(d1);
  return db.select().from(productImages).where(eq(productImages.productId, productId)).all();
}

/**
 * Sort order for a newly uploaded image.
 *
 * Every reader picks the *first* image by `sortOrder ASC`, so a new upload
 * that reused sortOrder 0 tied with the existing photo and the older row won —
 * "change photo" silently kept showing the old picture. Giving the new image
 * a strictly lower sort order makes it the primary one for every consumer
 * (catalog, search, cart, storefront) without touching those readers.
 */
export async function nextProductImageSortOrder(d1: D1Database, productId: string) {
  const db = getDb(d1);
  const rows = await db
    .select({ sortOrder: productImages.sortOrder })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .all();
  if (!rows.length) return 0;
  const min = Math.min(...rows.map((r) => r.sortOrder ?? 0));
  return min - 1;
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
