import { getDb } from '@vyro/db';
import {
  invoiceUploads,
  invoiceLineItems,
  categoryMappings,
  type NewInvoiceUpload,
  type NewInvoiceLineItem,
  type NewCategoryMapping,
} from '@vyro/db/schema';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
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
  },
): Promise<string> {
  const id = newId();
  await getDb(env.DB).insert(invoiceUploads).values({
    id,
    businessId: input.businessId,
    uploadedByUserId: input.uploadedByUserId,
    supplierId: input.supplierId ?? null,
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
