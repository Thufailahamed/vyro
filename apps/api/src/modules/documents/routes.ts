import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireBusinessRole } from '@vyro/auth';
import { httpError } from '../../lib/errors';
import { rateLimit } from '../../middleware/rateLimit';
import type { Ctx } from '../../middleware/session';
import type { Env } from '../../env';
import {
  buildR2Key,
  createUpload,
  getUpload,
  listUploads,
  saveReviewedLines,
  recordCategoryCorrection,
  listMappingsForBusiness,
  listInvoiceMatchCandidates,
  upsertInvoiceProductAlias,
} from './repository';
import { categorizeItems, normalizeInvoiceAlias, type CategorySlug } from '@vyro/ai';
import { getDb } from '@vyro/db';
import { invoiceUploads, purchaseOrders } from '@vyro/db/schema';
import { eq, desc } from 'drizzle-orm';
import { queueSend } from '../../lib/queue';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

// Persisted auto-reconciliation for the order page card (doc-intel v2 A).
// Reads the newest PO-linked upload's stored result — no matcher re-run.
router.get('/by-po/:poId/auto-reconciliation', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('poId');
  const db = getDb(c.env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');
  if (!ctx.businesses.some((b) => b.businessId === po.businessId)) {
    throw httpError(403, 'FORBIDDEN', 'Not your purchase order');
  }
  const upload = await db
    .select({
      id: invoiceUploads.id,
      status: invoiceUploads.reconciliationStatus,
      json: invoiceUploads.reconciliationJson,
      createdAt: invoiceUploads.createdAt,
    })
    .from(invoiceUploads)
    .where(eq(invoiceUploads.purchaseOrderId, poId))
    .orderBy(desc(invoiceUploads.createdAt))
    .limit(1)
    .get();
  if (!upload || upload.status === 'none') return c.json({ status: 'none' });
  return c.json({
    status: upload.status,
    payload: upload.json ? JSON.parse(upload.json) : null,
    uploadId: upload.id,
    createdAt: upload.createdAt,
  });
});

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BYTES = 10 * 1024 * 1024;

router.post('/upload-direct', rateLimit({ key: 'doc-upload', limit: 20, window: 60 }), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'purchasing']);

  const form = await c.req.formData();
  const file = form.get('file');
  const supplierIdRaw = form.get('supplierId');
  const supplierId = typeof supplierIdRaw === 'string' && supplierIdRaw.length > 0 ? supplierIdRaw : null;
  // Optional PO link: docs-invoice auto-reconcile (scene: buyer uploads the
  // supplier invoice straight from order detail). Gates validate ownership +
  // lifecycle before we accept the file.
  const poIdRaw = form.get('purchaseOrderId');
  const purchaseOrderId = typeof poIdRaw === 'string' && poIdRaw.length > 0 ? poIdRaw : null;
  if (purchaseOrderId) {
    const po = await getDb(c.env.DB).select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).get();
    if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');
    if (po.businessId !== businessId) throw httpError(403, 'FORBIDDEN', 'Not your purchase order');
    if (po.status !== 'delivered' && po.status !== 'completed') {
      throw httpError(400, 'VALIDATION_ERROR', 'Invoices can be attached once the order is delivered');
    }
  }
  if (!(file instanceof File)) throw httpError(400, 'VALIDATION_ERROR', 'file field required');
  if (!ALLOWED_MIME.has(file.type)) throw httpError(400, 'VALIDATION_ERROR', `Unsupported type ${file.type}`);
  if (file.size > MAX_BYTES) throw httpError(413, 'PAYLOAD_TOO_LARGE', 'Max 10MB');
  if (file.size <= 0) throw httpError(400, 'VALIDATION_ERROR', 'Empty file');

  const buf = new Uint8Array(await file.arrayBuffer());
  const uploadId = await createUpload(c.env, {
    businessId,
    uploadedByUserId: ctx.userId,
    r2Key: 'placeholder',
    mimeType: file.type,
    originalFilename: file.name,
    sizeBytes: file.size,
    supplierId,
    purchaseOrderId,
  });
  const r2Key = buildR2Key(businessId, uploadId, file.name);
  try {
    await c.env.INVOICES.put(r2Key, buf, { httpMetadata: { contentType: file.type } });
    await getDb(c.env.DB).update(invoiceUploads).set({ r2Key }).where(eq(invoiceUploads.id, uploadId)).run();
  } catch (err) {
    // Never leave a placeholder row: R2 or DB failure rolls back the upload.
    try {
      await getDb(c.env.DB).delete(invoiceUploads).where(eq(invoiceUploads.id, uploadId)).run();
    } catch {
      /* ignore secondary failure */
    }
    throw err;
  }
  await queueSend(c.env, 'invoices', { uploadId });

  return c.json({ uploadId, status: 'pending' });
});

router.get('/', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'purchasing', 'accountant']);
  const rows = await listUploads(c.env, businessId);
  const safe = rows.map((r) => {
    const { rawExtractionJson: _r, errorMessage: _e, ...rest } = r;
    void _r;
    void _e;
    return rest;
  });
  return c.json({ uploads: safe });
});

router.get('/:id', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'purchasing', 'accountant']);
  const id = c.req.param('id');
  const row = await getUpload(c.env, businessId, id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Upload not found');
  let matchCandidates: Array<{ productId: string; productName: string; unit: string | null }> = [];
  if (row.purchaseOrderId) {
    const linkedPo = await getDb(c.env.DB)
      .select({ businessId: purchaseOrders.businessId })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, row.purchaseOrderId))
      .get();
    if (!linkedPo || linkedPo.businessId !== businessId) {
      throw httpError(403, 'FORBIDDEN', 'Invoice is not linked to your purchase order');
    }
    matchCandidates = await listInvoiceMatchCandidates(c.env, row.purchaseOrderId);
  }
  return c.json({ upload: { ...row, matchCandidates } });
});

const reviewSchema = z
  .object({
    totalCents: z.number().int().min(0).nullable().optional(),
    lines: z
      .array(
        z
          .object({
            lineNumber: z.number().int().min(1).max(500),
            description: z.string().min(1).max(200),
            quantity: z.number().nullable().optional(),
            unit: z.string().max(20).nullable().optional(),
            unitPriceCents: z.number().int().nullable().optional(),
            totalCents: z.number().int().nullable().optional(),
            categorySlug: z
              .enum(['food', 'packaging', 'cleaning', 'office', 'equipment', 'other'])
              .nullable()
              .optional(),
            productId: z.string().nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

router.post('/:id/review', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'purchasing', 'accountant']);
  const id = c.req.param('id');
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());

  const existing = await getUpload(c.env, businessId, id);
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Upload not found');

  let linkedSupplierId: string | null = null;
  if (existing.purchaseOrderId) {
    const linkedPo = await getDb(c.env.DB)
      .select({ businessId: purchaseOrders.businessId, supplierId: purchaseOrders.supplierId })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, existing.purchaseOrderId))
      .get();
    if (!linkedPo || linkedPo.businessId !== businessId) {
      throw httpError(403, 'FORBIDDEN', 'Invoice is not linked to your purchase order');
    }
    linkedSupplierId = linkedPo.supplierId;
  }
  const matchCandidates = existing.purchaseOrderId
    ? await listInvoiceMatchCandidates(c.env, existing.purchaseOrderId)
    : [];
  const allowedProductIds = new Set(matchCandidates.map((candidate) => candidate.productId));
  if (parsed.data.lines.some((line) => line.productId != null && !allowedProductIds.has(line.productId))) {
    throw httpError(400, 'VALIDATION_ERROR', 'Selected product must be on this purchase order');
  }

  const mappings = await listMappingsForBusiness(c.env, businessId);
  const descriptions = parsed.data.lines.map((l) => ({ description: l.description }));
  const autoByDesc = new Map<string, string>();
  for (const r of categorizeItems(descriptions, mappings as any, businessId)) {
    autoByDesc.set(r.description.toLowerCase().trim(), r.categorySlug);
  }

  const linesWithSource = parsed.data.lines.map((l) => {
    const auto = autoByDesc.get(l.description.toLowerCase().trim()) ?? 'other';
    const chosen = (l.categorySlug ?? auto) as CategorySlug;
    const corrected = chosen !== auto;
    return {
      lineNumber: l.lineNumber,
      description: l.description,
      quantity: l.quantity ?? null,
      unit: l.unit ?? null,
      unitPriceCents: l.unitPriceCents ?? null,
      totalCents: l.totalCents ?? null,
      categorySlug: chosen,
      categorySource: (corrected ? 'manual' : 'rule') as 'manual' | 'rule',
      productId: l.productId ?? null,
    };
  });

  await saveReviewedLines(c.env, {
    businessId,
    uploadId: id,
    reviewedByUserId: ctx.userId,
    lines: linesWithSource,
    ...(parsed.data.totalCents !== undefined ? { totalCents: parsed.data.totalCents } : {}),
  });

  // Learn exact supplier aliases only from an explicit PO product selection.
  // If duplicate normalized descriptions in one invoice select different PO
  // products, leave that alias unchanged instead of learning an arbitrary row.
  if (linkedSupplierId) {
    const aliasSelections = new Map<string, string>();
    const conflictingAliases = new Set<string>();
    for (const line of parsed.data.lines) {
      if (!line.productId || line.description.trim().toLowerCase() === 'untitled line') continue;
      const normalizedAlias = normalizeInvoiceAlias(line.description);
      if (!normalizedAlias) continue;
      const previousProductId = aliasSelections.get(normalizedAlias);
      if (previousProductId && previousProductId !== line.productId) {
        conflictingAliases.add(normalizedAlias);
      } else {
        aliasSelections.set(normalizedAlias, line.productId);
      }
    }
    for (const [normalizedAlias, productId] of aliasSelections) {
      if (conflictingAliases.has(normalizedAlias)) continue;
      try {
        await upsertInvoiceProductAlias(c.env, {
          businessId,
          supplierId: linkedSupplierId,
          normalizedAlias,
          productId,
          sourceUploadId: id,
          createdByUserId: ctx.userId,
        });
      } catch {
        // Alias memory is best-effort; a successful invoice review stays saved.
        console.warn('[documents] invoice product alias persistence failed', {
          uploadId: id,
          code: 'ALIAS_PERSIST_FAILED',
        });
      }
    }
  }

  for (let i = 0; i < parsed.data.lines.length; i++) {
    const src = linesWithSource[i]!.categorySource;
    if (src !== 'manual') continue;
    const line = parsed.data.lines[i]!;
    const pattern = line.description.split(/\s+/).slice(0, 3).join(' ').toLowerCase().slice(0, 80);
    if (!pattern || !line.categorySlug) continue;
    try {
      await recordCategoryCorrection(c.env, {
        businessId,
        matchPattern: pattern,
        categorySlug: line.categorySlug,
      });
    } catch {
      // Unique-index collisions on repeat corrections are non-fatal.
    }
  }

  // Doc-intel v2 phase A: a manual review on a PO-linked upload replaces the
  // auto-staged lines — re-run reconciliation against the corrected data.
  const fresh = await getUpload(c.env, businessId, id);
  if (fresh?.purchaseOrderId) {
    const { reconcileIfLinked } = await import('./reconcile');
    await reconcileIfLinked(c.env, id);
  }

  return c.json({ ok: true });
});

export default router;
