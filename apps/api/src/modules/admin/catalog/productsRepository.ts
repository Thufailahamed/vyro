import { getDb } from '@vyro/db';
import { products, categories, supplierProducts, adminAuditLogs } from '@vyro/db/schema';
import { and, eq, like, lt, desc, isNull, isNotNull, or, sql } from 'drizzle-orm';

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName?: string | null;
  brand: string | null;
  unit: string;
  packSize: string | null;
  active: boolean;
  featured: boolean;
  moderationNotes: string | null;
  createdAt: number;
  updatedAt: number;
};

export async function listProducts(
  d1: D1Database,
  opts: {
    q?: string | undefined;
    categoryId?: string | undefined;
    supplierId?: string | undefined;
    active?: boolean | undefined;
    featured?: boolean | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
): Promise<{ items: ProductRow[]; nextCursor: string | null }> {
  const db = getDb(d1);
  const limit = opts.limit ?? 50;
  const conds = [
    opts.q ? like(products.name, `%${opts.q}%`) : undefined,
    opts.categoryId ? eq(products.categoryId, opts.categoryId) : undefined,
    opts.active !== undefined ? eq(products.active, opts.active) : undefined,
    opts.featured !== undefined ? eq(products.featured, opts.featured) : undefined,
    opts.cursor ? lt(products.createdAt, Number(opts.cursor)) : undefined,
  ];
  if (opts.supplierId) {
    const offerIds = db
      .select({ productId: supplierProducts.productId })
      .from(supplierProducts)
      .where(eq(supplierProducts.supplierId, opts.supplierId));
    conds.push(sql`${products.id} IN (${offerIds})`);
  }
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      categoryId: products.categoryId,
      categoryName: categories.name,
      brand: products.brand,
      unit: products.unit,
      packSize: products.packSize,
      active: products.active,
      featured: products.featured,
      moderationNotes: products.moderationNotes,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conds))
    .orderBy(desc(products.createdAt))
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? null,
    brand: r.brand,
    unit: r.unit,
    packSize: r.packSize,
    active: r.active,
    featured: r.featured,
    moderationNotes: r.moderationNotes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
  const nextCursor = hasMore ? String(items[items.length - 1]!.createdAt) : null;
  return { items, nextCursor };
}

export async function getProduct(d1: D1Database, id: string) {
  const db = getDb(d1);
  const row = (await db.select().from(products).where(eq(products.id, id)).get()) ?? null;
  if (!row) return null;
  const offers = await db
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.productId, id))
    .all();
  const category = row.categoryId
    ? ((await db.select().from(categories).where(eq(categories.id, row.categoryId)).get()) ?? null)
    : null;
  return { product: row, offers, category };
}

export async function updateProduct(
  d1: D1Database,
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    categoryId: string;
    brand: string | null;
    unit: string;
    packSize: string | null;
    active: boolean;
    featured: boolean;
    moderationNotes: string | null;
  }>,
): Promise<{ before: ProductRow; after: ProductRow } | null> {
  const db = getDb(d1);
  const before = (await db.select().from(products).where(eq(products.id, id)).get()) as ProductRow | undefined;
  if (!before) return null;
  const updated = { ...before, ...patch, updatedAt: Date.now() };
  await db
    .update(products)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.brand !== undefined ? { brand: patch.brand } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.packSize !== undefined ? { packSize: patch.packSize } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.featured !== undefined ? { featured: patch.featured } : {}),
      ...(patch.moderationNotes !== undefined ? { moderationNotes: patch.moderationNotes } : {}),
      updatedAt: updated.updatedAt,
    })
    .where(eq(products.id, id))
    .run();
  return { before, after: updated };
}

export async function lastAuditForProduct(d1: D1Database, productId: string, limit = 20) {
  const db = getDb(d1);
  return db
    .select({
      id: adminAuditLogs.id,
      action: adminAuditLogs.action,
      actorId: adminAuditLogs.actorId,
      createdAt: adminAuditLogs.createdAt,
      before: adminAuditLogs.before,
      after: adminAuditLogs.after,
    })
    .from(adminAuditLogs)
    .where(and(eq(adminAuditLogs.targetType, 'product'), eq(adminAuditLogs.targetId, productId)))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(limit)
    .all();
}

// Re-exports for callers that want the raw filters
export { and, eq, isNull, isNotNull, or };
