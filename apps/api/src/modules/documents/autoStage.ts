import { categorizeItems, type CategorySlug } from '@vyro/ai';
import { getDb } from '@vyro/db';
import { invoiceLineItems } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Env } from '../../env';
import { listMappingsForBusiness } from './repository';

type OcrItem = {
  description: string;
  quantity?: number | undefined;
  unit?: string | undefined;
  unitPriceCents?: number | undefined;
  totalCents?: number | undefined;
};

/**
 * Stage OCR-extracted line items immediately for PO-linked uploads so
 * reconciliation can run without waiting for a human review pass.
 * Idempotent: prior rows for the upload are replaced.
 */
export async function persistOcrLines(
  env: Env,
  upload: { id: string; businessId: string },
  items: OcrItem[],
): Promise<{ staged: number }> {
  const db = getDb(env.DB);
  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.uploadId, upload.id));
  if (!items.length) return { staged: 0 };

  const mappings = await listMappingsForBusiness(env, upload.businessId);
  const auto = categorizeItems(
    items.map((it) => ({ description: it.description })),
    mappings as never,
    upload.businessId,
  );
  const byDesc = new Map(auto.map((r) => [r.description.toLowerCase().trim(), r.categorySlug]));

  const rows = items.map((it, i) => ({
    id: newId(),
    uploadId: upload.id,
    businessId: upload.businessId,
    lineNumber: i + 1,
    description: it.description,
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    unitPriceCents: it.unitPriceCents ?? null,
    totalCents: it.totalCents ?? null,
    // Auto-staged rows are rule-categorized; the buyer's manual review
    // (documents/:id/review) replaces them with 'manual' corrections.
    categorySlug: byDesc.get(it.description.toLowerCase().trim()) ?? ('other' as CategorySlug),
    categorySource: 'rule' as const,
    productId: null,
  }));
  await db.insert(invoiceLineItems).values(rows);
  return { staged: rows.length };
}
