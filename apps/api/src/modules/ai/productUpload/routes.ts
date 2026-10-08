import { Hono } from 'hono';
import { getDb } from '@vyro/db';
import {
  productUploadRows,
  productUploadSessions,
  products,
  categories,
  supplierProducts,
  suppliers,
} from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { newId, toCsv } from '@vyro/shared';
import { productUploadCreateSchema, productUploadRowPatchSchema } from '@vyro/validation/productUpload';
import { session } from '../../../middleware/session';
import type { Ctx } from '../../../middleware/session';
import { httpError } from '../../../lib/errors';
import { queueSend } from '../../../lib/queue';
import { detectSourceKind } from './extract';
import { runImport, IMPORT_COLUMNS } from '../../supplierProducts/importExport';
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
  const { supplierId, filename, contentType, base64 } = parsed.data;
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
  const r2Key = `product-uploads/${supplierId}/${sessionId}.${ext || 'bin'}`;
  await c.env.PRODUCTS.put(r2Key, bytes);

  const now = Date.now();
  await getDb(c.env.DB).insert(productUploadSessions).values({
    id: sessionId,
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

router.post('/:id/commit', session(), async (c) => {
  const ctx = requireCtx(c);
  const db = getDb(c.env.DB);
  const sessionRow = await db.select().from(productUploadSessions).where(eq(productUploadSessions.id, c.req.param('id'))).get();
  if (!sessionRow) throw httpError(404, 'NOT_FOUND', 'Upload not found');
  if (sessionRow.status !== 'extracted') throw httpError(409, 'CONFLICT', 'Upload is not ready to commit');
  await requireSupplierMember(c.env, sessionRow.supplierId, ctx.userId);

  const rows = await db.select().from(productUploadRows).where(eq(productUploadRows.sessionId, sessionRow.id)).all();
  rows.sort((a, b) => a.rowIndex - b.rowIndex);
  const live = rows.filter((r) => r.decision !== 'rejected');

  // 1. Catalog proposals: unmatched names become inactive products that land
  //    in the existing admin catalog moderation flow; their offer goes live
  //    only after an admin approves (activates) the product.
  const fallbackCategory = (await db.select({ id: categories.id }).from(categories).limit(1).get()) as { id: string };
  if (!fallbackCategory) throw httpError(500, 'INTERNAL', 'No categories exist');
  const proposals: string[] = [];
  const proposalProductIds: string[] = [];
  for (const r of live) {
    if ((r.matchType === 'proposal' || r.matchType === 'none') && r.productName && !r.matchProductId) {
      const pid = newId();
      const now = Date.now();
      // Active during the import window (the importer requires live catalog
      // products); set back to inactive after the real run below so admin
      // approval is the only way it goes public.
      await db.insert(products).values({
        id: pid,
        name: r.productName,
        description: null,
        categoryId: fallbackCategory.id,
        brand: null,
        unit: r.unit ?? 'unit',
        packSize: null,
        active: true,
        featured: false,
        moderationNotes: `AI upload proposal: supplier ${sessionRow.supplierId}`,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        hsCode: null,
        countryOfOrigin: null,
        isExportControlled: false,
      });
      proposals.push(r.productName);
      proposalProductIds.push(pid);
      await db.update(productUploadRows)
        .set({ matchProductId: pid, matchType: 'product', updatedAt: now })
        .where(eq(productUploadRows.id, r.id));
      r.matchProductId = pid;
    }
  }

  // 2. Build CSV in IMPORT_COLUMNS order. price_lkr is the importer's cents/100.
  const csvRows = live
    .filter((r) => r.decision !== 'rejected' && r.matchProductId)
    .map((r) => [
      '', // offer_id — always creates a fresh offer
      r.matchProductId,
      r.productName,
      r.unit ?? '',
      r.supplierSku ?? '',
      r.priceLkr != null ? (r.priceLkr as number).toFixed(2) : '',
      r.minOrderQty ?? '',
      r.leadTimeDays ?? '',
      r.stockQty ?? '',
      'yes',
      r.tier1MinQty ?? '',
      r.tier1DiscountPct ?? '',
      r.tier2MinQty ?? '',
      r.tier2DiscountPct ?? '',
      r.tier3MinQty ?? '',
      r.tier3DiscountPct ?? '',
    ]);
  const csv = toCsv([...IMPORT_COLUMNS], csvRows);

  // 3. Dry-run first through the single write path; partially-ok or clean
  //    runs proceed, fully-failing runs keep the session open for edits.
  const dry = await runImport(c.env, c.env.DB, {
    supplierId: sessionRow.supplierId,
    userId: ctx.userId,
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  }, csv, true);
  if (!live.length || dry.results.every((res) => res.status === 'error')) {
    return c.json({ results: dry.results, summary: dry.summary, proposals }, 200);
  }
  const real = await runImport(c.env, c.env.DB, {
    supplierId: sessionRow.supplierId,
    userId: ctx.userId,
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  }, csv, false);
  // Block the proposal products (and their fresh offers) until an admin
  // approves them: product activation via catalog moderation, and the
  // supplier switches their offer on from the pricing page.
  const now = Date.now();
  if (proposalProductIds.length) {
    for (const pid of proposalProductIds) {
      await db.update(products).set({ active: false, updatedAt: now }).where(eq(products.id, pid));
      const offerRow = await db.select().from(supplierProducts).where(eq(supplierProducts.productId, pid)).get();
      if (offerRow) {
        const { updateOffer } = await import('../../supplierProducts/repository');
        await updateOffer(c.env.DB, offerRow.id, { active: false });
      }
    }
  }
  await db.update(productUploadSessions)
    .set({ status: 'committed', committedAt: now, updatedAt: now })
    .where(eq(productUploadSessions.id, sessionRow.id));
  return c.json({ results: real.results, summary: real.summary, proposals }, 200);
});

export default router;
