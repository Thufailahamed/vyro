import { getDb } from '@vyro/db';
import {
  invoiceUploads,
  invoiceLineItems,
  invoiceProductAliases,
  purchaseOrderItems,
  supplierProducts,
  products,
  auditLogs,
  categoryMappings,
  type NewInvoiceUpload,
  type NewInvoiceLineItem,
  type NewCategoryMapping,
} from '@vyro/db/schema';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Env } from '../../env';

export function sanitizeFilename(name: string): string {
  const raw = name ?? 'file';
  const hasTraversal = /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(raw);
  const source = hasTraversal ? (raw.split(/[\\/]/).pop() ?? 'file') : raw;
  const cleaned = source
    .replace(/[\\\/]/g, '_')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 100);
  return cleaned || 'file';
}

export function buildR2Key(businessId: string, uploadId: string, filename: string): string {
  return `${businessId}/${uploadId}/${sanitizeFilename(filename)}`;
}

export async function createUpload(
  env: Env,
  input: {
    businessId: string;
    uploadedByUserId: string;
    r2Key: string;
    mimeType: string;
    originalFilename: string;
    sizeBytes: number;
    supplierId?: string | null;
    purchaseOrderId?: string | null;
  },
): Promise<string> {
  const id = newId();
  await getDb(env.DB).insert(invoiceUploads).values({
    id,
    businessId: input.businessId,
    uploadedByUserId: input.uploadedByUserId,
    supplierId: input.supplierId ?? null,
    purchaseOrderId: input.purchaseOrderId ?? null,
    status: 'pending',
    r2Key: input.r2Key,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename,
    sizeBytes: input.sizeBytes,
    createdAt: Date.now(),
  } satisfies NewInvoiceUpload);
  return id;
}

export async function listUploads(env: Env, businessId: string, limit = 50) {
  return getDb(env.DB)
    .select()
    .from(invoiceUploads)
    .where(eq(invoiceUploads.businessId, businessId))
    .orderBy(desc(invoiceUploads.createdAt))
    .limit(limit)
    .all();
}

export async function getUpload(env: Env, businessId: string, id: string) {
  const row = await getDb(env.DB)
    .select()
    .from(invoiceUploads)
    .where(and(eq(invoiceUploads.id, id), eq(invoiceUploads.businessId, businessId)))
    .get();
  if (!row) return null;
  const items = await getDb(env.DB)
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.uploadId, id))
    .orderBy(invoiceLineItems.lineNumber)
    .all();
  return { ...row, items };
}

export async function listInvoiceMatchCandidates(
  env: Env,
  purchaseOrderId: string,
): Promise<Array<{ productId: string; productName: string; unit: string | null }>> {
  const rows = await getDb(env.DB)
    .select({
      productId: products.id,
      productName: purchaseOrderItems.productNameSnapshot,
      unit: products.unit,
    })
    .from(purchaseOrderItems)
    .innerJoin(supplierProducts, eq(purchaseOrderItems.supplierProductId, supplierProducts.id))
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId))
    .all();
  const unique = new Map<string, { productId: string; productName: string; unit: string | null }>();
  for (const row of rows) {
    if (!unique.has(row.productId)) unique.set(row.productId, row);
  }
  return [...unique.values()];
}

export async function listInvoiceProductAliases(
  env: Env,
  businessId: string,
  supplierId: string,
  normalizedAliases: string[],
): Promise<Array<{ normalizedAlias: string; productId: string }>> {
  const values = [...new Set(normalizedAliases.filter(Boolean))];
  if (!values.length) return [];
  const db = getDb(env.DB);
  const matches: Array<{ normalizedAlias: string; productId: string }> = [];
  for (let i = 0; i < values.length; i += 80) {
    const batch = values.slice(i, i + 80);
    matches.push(...await db
      .select({ normalizedAlias: invoiceProductAliases.normalizedAlias, productId: invoiceProductAliases.productId })
      .from(invoiceProductAliases)
      .where(and(
        eq(invoiceProductAliases.businessId, businessId),
        eq(invoiceProductAliases.supplierId, supplierId),
        inArray(invoiceProductAliases.normalizedAlias, batch),
      ))
      .all());
  }
  return matches;
}

export async function upsertInvoiceProductAlias(
  env: Env,
  input: {
    businessId: string;
    supplierId: string;
    normalizedAlias: string;
    productId: string;
    sourceUploadId: string;
    createdByUserId: string;
  },
): Promise<{ id: string; previousProductId: string | null; changed: boolean }> {
  const db = getDb(env.DB);
  const before = await db.select().from(invoiceProductAliases).where(and(
    eq(invoiceProductAliases.businessId, input.businessId),
    eq(invoiceProductAliases.supplierId, input.supplierId),
    eq(invoiceProductAliases.normalizedAlias, input.normalizedAlias),
  )).get();
  if (before?.productId === input.productId) {
    return { id: before.id, previousProductId: before.productId, changed: false };
  }

  const now = Date.now();
  const attemptedId = before?.id ?? newId();
  const [saved] = await db.insert(invoiceProductAliases).values({
    id: attemptedId,
    businessId: input.businessId,
    supplierId: input.supplierId,
    normalizedAlias: input.normalizedAlias,
    productId: input.productId,
    sourceUploadId: input.sourceUploadId,
    createdByUserId: input.createdByUserId,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [invoiceProductAliases.businessId, invoiceProductAliases.supplierId, invoiceProductAliases.normalizedAlias],
    set: {
      productId: input.productId,
      sourceUploadId: input.sourceUploadId,
      createdByUserId: input.createdByUserId,
      updatedAt: now,
    },
  }).returning({ id: invoiceProductAliases.id });
  const id = saved?.id ?? attemptedId;

  await db.insert(auditLogs).values({
    id: newId(),
    actorUserId: input.createdByUserId,
    action: 'invoice_product_alias.upsert',
    resourceType: 'invoice_product_alias',
    resourceId: id,
    metadata: JSON.stringify({
      businessId: input.businessId,
      supplierId: input.supplierId,
      sourceUploadId: input.sourceUploadId,
      previousProductId: before?.productId ?? null,
      productId: input.productId,
    }),
    createdAt: now,
  });

  return { id, previousProductId: before?.productId ?? null, changed: true };
}

export async function saveReviewedLines(
  env: Env,
  input: {
    businessId: string;
    uploadId: string;
    reviewedByUserId: string;
    lines: Array<{
      lineNumber: number;
      description: string;
      quantity?: number | null;
      unit?: string | null;
      unitPriceCents?: number | null;
      totalCents?: number | null;
      categorySlug: string | null;
      categorySource: 'rule' | 'default' | 'manual';
      productId?: string | null;
    }>;
    totalCents?: number | null;
  },
) {
  const db = getDb(env.DB);
  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.uploadId, input.uploadId));
  if (input.lines.length) {
    const rows: NewInvoiceLineItem[] = input.lines.map((l) => ({
      id: newId(),
      uploadId: input.uploadId,
      businessId: input.businessId,
      lineNumber: l.lineNumber,
      description: l.description,
      quantity: l.quantity ?? null,
      unit: l.unit ?? null,
      unitPriceCents: l.unitPriceCents ?? null,
      totalCents: l.totalCents ?? null,
      categorySlug: l.categorySlug,
      categorySource: l.categorySource,
      productId: l.productId ?? null,
    }));
    await db.insert(invoiceLineItems).values(rows);
  }
  await db
    .update(invoiceUploads)
    .set({
      status: 'reviewed',
      reviewedAt: Date.now(),
      reviewedByUserId: input.reviewedByUserId,
      totalCents: input.totalCents ?? null,
    })
    .where(
      and(
        eq(invoiceUploads.id, input.uploadId),
        eq(invoiceUploads.businessId, input.businessId),
      ),
    );
}

export async function recordCategoryCorrection(
  env: Env,
  input: { businessId: string; matchPattern: string; categorySlug: string },
): Promise<void> {
  await getDb(env.DB).insert(categoryMappings).values({
    id: newId(),
    businessId: input.businessId,
    matchPattern: input.matchPattern.slice(0, 80),
    categorySlug: input.categorySlug,
    priority: 50,
    source: 'manual',
    createdAt: Date.now(),
  } satisfies NewCategoryMapping);
}

export async function listMappingsForBusiness(env: Env, businessId: string) {
  return getDb(env.DB)
    .select()
    .from(categoryMappings)
    .where(or(eq(categoryMappings.businessId, businessId), isNull(categoryMappings.businessId)))
    .orderBy(desc(categoryMappings.priority))
    .all();
}

export interface CategoryBreakdownRow {
  slug: string | null;
  total: number;
}

export async function expenseCategoryBreakdown(
  env: Env,
  businessId: string,
  _months: number,
): Promise<CategoryBreakdownRow[]> {
  const rows = await getDb(env.DB)
    .select({
      slug: invoiceLineItems.categorySlug,
      total: sql<number>`COALESCE(SUM(${invoiceLineItems.totalCents}), 0)`,
    })
    .from(invoiceLineItems)
    .where(
      and(
        eq(invoiceLineItems.businessId, businessId),
        sql`${invoiceLineItems.totalCents} IS NOT NULL`,
      ),
    )
    .groupBy(invoiceLineItems.categorySlug)
    .all();
  return rows;
}
