import { Hono } from 'hono';
import { getDb } from '@vyro/db';
import { productUploadRows, productUploadSessions, suppliers } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import { productUploadCreateSchema, productUploadRowPatchSchema } from '@vyro/validation/productUpload';
import { session } from '../../../middleware/session';
import type { Ctx } from '../../../middleware/session';
import { httpError } from '../../../lib/errors';
import { queueSend } from '../../../lib/queue';
import { detectSourceKind } from './extract';
import type { Env } from '../../../env';

/**
 * AI product upload endpoints (supplier portal):
 *   POST /api/ai/product-uploads            — stage a file, enqueue extraction
 *   GET  /api/ai/product-uploads/:id        — session status + staged rows
 *   PATCH /api/ai/product-uploads/:id/rows/:rowId — review decision / edits
 *   POST /api/ai/product-uploads/:id/commit — dry-run then real import (Task 7)
 *
 * The upload route only stages; the queue consumer fills rows. AI never
 * writes offers directly — commit goes through the supplier import pipeline.
 */

// 7.5 MB decoded ceiling (spec cap); request schema caps the base64 string.
const MAX_BYTES = 7_500_000;
const REJECTED_EXTENSIONS = new Set(['xlsx', 'xls', 'docx']);

function requireCtx(c: any): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'Sign in required');
  return ctx;
}

async function requireSupplierMember(env: Env, supplierId: string, userId: string) {
  const supplier = await getDb(env.DB).select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!supplier) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  const { supplierService } = await import('../../suppliers/service');
  await supplierService.requireMember(env.DB, supplierId, userId);
}

const router = new Hono<{ Bindings: Env }>();

router.post('/', session(), async (c) => {
  const ctx = requireCtx(c);
  const parsed = productUploadCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid upload', parsed.error.flatten());
  const { supplierId, businessId, filename, contentType, base64 } = parsed.data;
  await requireSupplierMember(c.env, supplierId, ctx.userId);

  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  if (REJECTED_EXTENSIONS.has(ext)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Spreadsheets must be re-exported as CSV — photos, PDFs, JPEG/PNG/WebP are fine');
  }

  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  if (bytes.byteLength > MAX_BYTES) throw httpError(400, 'VALIDATION_ERROR', 'File too large (max 7.5 MB)');
  const kind = detectSourceKind(filename, contentType);
  if (!kind) throw httpError(400, 'VALIDATION_ERROR', 'Unsupported file type. Upload CSV/TSV text, a price-list photo/PDF, or a product photo.');

  const sessionId = newId();
  const r2Key = `product-uploads/${businessId}/${sessionId}.${ext || 'bin'}`;
  await c.env.PRODUCTS.put(r2Key, bytes);

  const now = Date.now();
  await getDb(c.env.DB).insert(productUploadSessions).values({
    id: sessionId,
    businessId,
    supplierId,
    userId: ctx.userId,
    status: 'pending',
    sourceKind: kind,
    r2Key,
    originalFilename: filename.slice(0, 120),
    mimeType: contentType,
    sizeBytes: bytes.byteLength,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    committedAt: null,
  });
  await queueSend(c.env, 'uploads', { sessionId });
  return c.json({ sessionId, status: 'pending' }, 201);
});

router.get('/:id', session(), async (c) => {
  const ctx = requireCtx(c);
  const db = getDb(c.env.DB);
  const sessionRow = await db.select().from(productUploadSessions).where(eq(productUploadSessions.id, c.req.param('id'))).get();
  if (!sessionRow) throw httpError(404, 'NOT_FOUND', 'Upload not found');
  await requireSupplierMember(c.env, sessionRow.supplierId, ctx.userId);
  const rows = await db.select().from(productUploadRows).where(eq(productUploadRows.sessionId, sessionRow.id)).all();
  rows.sort((a, b) => a.rowIndex - b.rowIndex);
  return c.json({ session: sessionRow, rows });
});

router.patch('/:id/rows/:rowId', session(), async (c) => {
  const ctx = requireCtx(c);
  const parsed = productUploadRowPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid patch', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const sessionRow = await db.select().from(productUploadSessions).where(eq(productUploadSessions.id, c.req.param('id'))).get();
  if (!sessionRow || sessionRow.status !== 'extracted') throw httpError(404, 'NOT_FOUND', 'Upload not found (or not ready)');
  await requireSupplierMember(c.env, sessionRow.supplierId, ctx.userId);
  const existing = await db.select().from(productUploadRows)
    .where(and(eq(productUploadRows.id, c.req.param('rowId')), eq(productUploadRows.sessionId, sessionRow.id)))
    .get();
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Row not found');
  const { decision, edited } = parsed.data;
  const merged = { ...existing, ...edited };
  const price = merged.priceLkr !== undefined && merged.priceLkr !== null ? Math.max(0, Number(merged.priceLkr)) : null;
  const [row] = await db
    .update(productUploadRows)
    .set({
      decision,
      productName: String(merged.productName ?? existing.productName).slice(0, 200),
      supplierSku: merged.supplierSku ?? null,
      unit: merged.unit ?? null,
      priceLkr: price as number | null,
      minOrderQty: merged.minOrderQty ?? null,
      leadTimeDays: merged.leadTimeDays ?? null,
      stockQty: merged.stockQty ?? null,
      tier1MinQty: merged.tier1MinQty ?? null,
      tier1DiscountPct: merged.tier1DiscountPct ?? null,
      tier2MinQty: merged.tier2MinQty ?? null,
      tier2DiscountPct: merged.tier2DiscountPct ?? null,
      tier3MinQty: merged.tier3MinQty ?? null,
      tier3DiscountPct: merged.tier3DiscountPct ?? null,
      updatedAt: Date.now(),
    })
    .where(eq(productUploadRows.id, existing.id))
    .returning();
  return c.json({ row });
});

export default router;
