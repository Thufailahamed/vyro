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
} from './repository';
import { categorizeItems, type CategorySlug } from '@vyro/ai';
import { getDb } from '@vyro/db';
import { invoiceUploads } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { queueSend } from '../../lib/queue';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BYTES = 10 * 1024 * 1024;

router.post('/upload-direct', rateLimit({ key: 'doc-upload', limit: 20, window: 60 }), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager']);

  const form = await c.req.formData();
  const file = form.get('file');
  const supplierIdRaw = form.get('supplierId');
  const supplierId = typeof supplierIdRaw === 'string' && supplierIdRaw.length > 0 ? supplierIdRaw : null;
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
  });
  const r2Key = buildR2Key(businessId, uploadId, file.name);
  await c.env.INVOICES.put(r2Key, buf, { httpMetadata: { contentType: file.type } });
  await getDb(c.env.DB).update(invoiceUploads).set({ r2Key }).where(eq(invoiceUploads.id, uploadId));
  await queueSend(c.env, 'invoices', { uploadId });

  return c.json({ uploadId, status: 'pending' });
});

router.get('/', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
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
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const id = c.req.param('id');
  const row = await getUpload(c.env, businessId, id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Upload not found');
  return c.json({ upload: row });
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
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const id = c.req.param('id');
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());

  const existing = await getUpload(c.env, businessId, id);
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Upload not found');

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

  return c.json({ ok: true });
});

export default router;
