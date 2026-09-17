import { and, asc, eq, isNull, like, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, supplierProducts, products, productImages, categories, businessTypes } from '@vyro/db/schema';
import { resolveImageUrl } from '../products/routes';

export async function findBySlug(d1: D1Database, slug: string) {
  const db = getDb(d1);
  return (await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      slug: suppliers.slug,
      city: suppliers.city,
      district: suppliers.district,
      description: suppliers.description,
      verificationStatus: suppliers.verificationStatus,
      status: suppliers.status,
      createdAt: suppliers.createdAt,
      reviewCount: suppliers.reviewCount,
      reviewAvg: suppliers.reviewAvg,
      businessTypeId: suppliers.businessTypeId,
      businessTypeName: businessTypes.name,
      countryCode: suppliers.countryCode,
      isExportEligible: suppliers.isExportEligible,
      defaultIncoterms: suppliers.defaultIncoterms,
    })
    .from(suppliers)
    .leftJoin(businessTypes, eq(suppliers.businessTypeId, businessTypes.id))
    .where(eq(suppliers.slug, slug))
    .get()) as any;
}

export async function listPublishedOffersBySupplierId(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  const rows = (await db
    .select({
      id: supplierProducts.id,
      productId: supplierProducts.productId,
      supplierId: supplierProducts.supplierId,
      priceCents: supplierProducts.priceCents,
      minOrderQty: supplierProducts.minOrderQty,
      tier1MinQty: supplierProducts.tier1MinQty,
      tier1DiscountPct: supplierProducts.tier1DiscountPct,
      tier2MinQty: supplierProducts.tier2MinQty,
      tier2DiscountPct: supplierProducts.tier2DiscountPct,
      tier3MinQty: supplierProducts.tier3MinQty,
      tier3DiscountPct: supplierProducts.tier3DiscountPct,
      leadTimeDays: supplierProducts.leadTimeDays,
      deliveryAvailable: supplierProducts.deliveryAvailable,
      deliveryRadiusKm: supplierProducts.deliveryRadiusKm,
      availabilityStatus: supplierProducts.availabilityStatus,
      stockQty: supplierProducts.stockQty,
      createdAt: supplierProducts.createdAt,
      productName: products.name,
      productDescription: products.description,
      unit: products.unit,
      packSize: products.packSize,
      brand: products.brand,
      categoryName: categories.name,
    })
    .from(supplierProducts)
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.active, true as never),
        isNull(supplierProducts.deletedAt),
      ),
    )
    .orderBy(asc(supplierProducts.createdAt))
    .all()) as any[];

  if (rows.length === 0) return [];

  const productIds = Array.from(new Set(rows.map((r) => r.productId)));
  const images = (await db
    .select({
      productId: productImages.productId,
      r2Key: productImages.r2Key,
      sortOrder: productImages.sortOrder,
    })
    .from(productImages)
    .where(sql`${productImages.productId} in (${sql.join(productIds.map((id) => sql`${id}`), sql.raw(','))})`)
    .orderBy(asc(productImages.sortOrder))
    .all()) as any[];

  const imageMap = new Map<string, string>();
  for (const img of images) {
    if (!imageMap.has(img.productId)) {
      imageMap.set(img.productId, resolveImageUrl(img.r2Key));
    }
  }

  return rows.map((r) => ({
    ...r,
    productImage: imageMap.get(r.productId) ?? null,
  }));
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
