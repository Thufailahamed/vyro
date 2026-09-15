import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import { httpError, type ErrorCode } from '../../lib/errors';
import type { Env } from '../../env';
import {
  adminFlagsQuerySchema,
  editReviewSchema,
  flagSchema,
  replySchema,
  resolveFlagSchema,
  reviewListQuerySchema,
  submitReviewSchema,
} from '@vyro/validation';
import { hasSupplierAccess } from '@vyro/auth';
import { getDb } from '@vyro/db';
import { supplierReviewImages } from '@vyro/db/schema';
import { rateLimit } from '../../middleware/rateLimit';
import * as svc from './service';
import * as repo from './repository';
import * as analytics from './analytics';
import * as cfgSvc from '../admin/platform/configSectionsService';

const router = new Hono<{ Bindings: Env }>();

router.use('/reviews*', rateLimit({ key: 'reviews-mutate', limit: 60, window: 60 }));

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

async function isReviewsEnabled(d1: D1Database): Promise<boolean> {
  const section = await cfgSvc.read(d1, 'feature_flags');
  const value = (section.value ?? {}) as Record<string, unknown>;
  return value['REVIEWS_ENABLED'] !== false; // default ON when flag absent
}

router.post('/reviews', async (c) => {
  if (!(await isReviewsEnabled(c.env.DB))) throw httpError(404, 'NOT_FOUND', 'Reviews disabled');
  const ctx = ctxOf(c);
  const parsed = submitReviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const allowedBusinessIds = ctx.businesses.map((b) => b.businessId).filter((x): x is string => !!x);
  try {
    const review = await svc.submitReview(
      c.env.DB,
      parsed.data,
      { userId: ctx.userId, allowedBusinessIds, role: 'buyer' },
    );
    if (parsed.data.imageR2Keys?.length) {
      const db = getDb(c.env.DB);
      await db
        .insert(supplierReviewImages)
        .values(
          parsed.data.imageR2Keys.slice(0, 3).map((k) => ({
            id: crypto.randomUUID(),
            reviewId: review.id,
            r2Key: k,
            createdAt: Date.now(),
          })),
        )
        .run();
      analytics.emit('review_photo_added', { reviewId: review.id, count: parsed.data.imageR2Keys.length });
    }
    analytics.emit('review_submitted', { reviewId: review.id, supplierId: review.supplierId, rating: review.rating });
    try {
      const { notifySupplierOrg } = await import('../notifications/dispatcher');
      await notifySupplierOrg(c.env.DB, c.env.NOTIFICATIONS_QUEUE, review.supplierId, {
        type: 'review.submitted',
        title: `New ${review.rating}-star review`,
        body: review.body.slice(0, 200),
        link: `/supplier/reviews?supplier=${review.supplierId}`,
      });
    } catch {
      /* best-effort */
    }
    return c.json({ review }, 201);
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.get('/suppliers/:id/reviews', async (c) => {
  const q = reviewListQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query', q.error.flatten());
  const items = (await repo.listReviews(c.env.DB, c.req.param('id'), q.data)) as any[];
  const ids = items.map((r) => r.id);
  const [replies, images] = await Promise.all([
    repo.findRepliesByReviewIds(c.env.DB, ids),
    repo.findImagesByReviewIds(c.env.DB, ids),
  ]);
  const byReply = new Map((replies as any[]).map((r) => [r.reviewId, r]));
  const byImg = new Map<string, any[]>();
  for (const im of images as any[]) {
    const arr = byImg.get(im.reviewId) ?? [];
    arr.push({ ...im, url: `/cdn/${im.r2Key}` });
    byImg.set(im.reviewId, arr);
  }
  return c.json({
    reviews: items.map((r) => ({
      ...r,
      reply: byReply.get(r.id) ?? null,
      images: byImg.get(r.id) ?? [],
      helpfulCount: r.helpfulCount ?? 0,
    })),
    nextCursor: items.length === q.data.limit ? items[items.length - 1].id : null,
  });
});

router.get('/suppliers/:id/review-summary', async (c) => {
  const agg = await repo.aggregateForSupplier(c.env.DB, c.req.param('id'));
  return c.json({
    count: agg.count,
    avg: agg.avg,
    lastReviewAt: agg.lastReviewAt,
    distribution: agg.distribution,
  });
});

router.post('/suppliers/:id/reviews/:reviewId/reply', async (c) => {
  if (!(await isReviewsEnabled(c.env.DB))) throw httpError(404, 'NOT_FOUND', 'Reviews disabled');
  const ctx = ctxOf(c);
  const supplierId = c.req.param('id');
  if (!hasSupplierAccess(ctx, supplierId)) throw httpError(403, 'FORBIDDEN', 'Not supplier owner');
  const parsed = replySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  try {
    const reply = await svc.postReply(c.env.DB, supplierId, c.req.param('reviewId'), parsed.data.body, {
      userId: ctx.userId,
      supplierId,
      role: 'supplier',
    });
    analytics.emit('review_replied', { reviewId: c.req.param('reviewId'), supplierId });
    return c.json({ reply }, 201);
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.patch('/suppliers/:id/reviews/:reviewId/flag', async (c) => {
  if (!(await isReviewsEnabled(c.env.DB))) throw httpError(404, 'NOT_FOUND', 'Reviews disabled');
  const ctx = ctxOf(c);
  const supplierId = c.req.param('id');
  if (!hasSupplierAccess(ctx, supplierId)) throw httpError(403, 'FORBIDDEN', 'Not supplier owner');
  const parsed = flagSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  try {
    const flag = await svc.flagReview(c.env.DB, supplierId, c.req.param('reviewId'), parsed.data, {
      userId: ctx.userId,
      supplierId,
      role: 'supplier',
    });
    analytics.emit('review_flagged', { reviewId: c.req.param('reviewId'), supplierId, reason: parsed.data.reason });
    return c.json({ flag }, 200);
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.get('/admin/reviews/flags', async (c) => {
  const ctx = ctxOf(c);
  if (!ctx.adminRole && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
  const q = adminFlagsQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query', q.error.flatten());
  const flags = await repo.listPendingFlags(c.env.DB, q.data.limit, q.data.cursor);
  return c.json({ flags });
});

router.post('/admin/reviews/flags/:flagId/resolve', async (c) => {
  const ctx = ctxOf(c);
  if (!ctx.adminRole && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
  const parsed = resolveFlagSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  try {
    await svc.resolveFlag(c.env.DB, c.req.param('flagId'), parsed.data, { userId: ctx.userId, role: 'admin' });
    analytics.emit('review_flag_resolved', { flagId: c.req.param('flagId'), decision: parsed.data.decision });
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.get('/admin/reviews/flag-burst', async (c) => {
  const ctx = ctxOf(c);
  if (!ctx.adminRole && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
  const windowHours = Number(c.req.query('windowHours') ?? '24');
  const minCount = Number(c.req.query('minCount') ?? '3');
  const sinceMs = Date.now() - Math.max(1, Math.min(windowHours, 168)) * 3_600_000;
  const min = Math.max(1, Math.min(minCount, 50));
  const items = await repo.flagBurstBySupplier(c.env.DB, sinceMs, min);
  return c.json({ windowHours, minCount: min, items });
});

router.delete('/admin/reviews/:reviewId', async (c) => {
  const ctx = ctxOf(c);
  if (!ctx.adminRole && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
  // Read supplierId first to recompute aggregate after delete.
  const review = await repo.findReviewById(c.env.DB, c.req.param('reviewId'));
  if (!review) throw httpError(404, 'NOT_FOUND', 'Review not found');
  await repo.adminDeleteReview(c.env.DB, c.req.param('reviewId'), ctx.userId, Date.now());
  await svc.recomputeAggregate(c.env.DB, review.supplierId);
  analytics.emit('review_deleted', { reviewId: c.req.param('reviewId'), supplierId: review.supplierId });
  return c.json({ ok: true });
});

router.get('/orders/:id/eligibility', async (c) => {
  const ctx = ctxOf(c);
  const allowedBusinessIds = ctx.businesses.map((b) => b.businessId).filter((x): x is string => !!x);
  const orderId = c.req.param('id');
  const result = await svc.checkEligibility(c.env.DB, orderId, { userId: ctx.userId, allowedBusinessIds, role: 'buyer' });
  return c.json({ canReview: result.canReview, reason: result.reason });
});

router.patch('/reviews/:id', async (c) => {
  if (!(await isReviewsEnabled(c.env.DB))) throw httpError(404, 'NOT_FOUND', 'Reviews disabled');
  const ctx = ctxOf(c);
  const parsed = editReviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const allowedBusinessIds = ctx.businesses.map((b) => b.businessId).filter((x): x is string => !!x);
  try {
    const updated = await svc.editReview(c.env.DB, c.req.param('id'), parsed.data, {
      userId: ctx.userId,
      allowedBusinessIds,
    });
    analytics.emit('review_edited', { reviewId: c.req.param('id') });
    return c.json({ review: updated });
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.delete('/reviews/:id', async (c) => {
  if (!(await isReviewsEnabled(c.env.DB))) throw httpError(404, 'NOT_FOUND', 'Reviews disabled');
  const ctx = ctxOf(c);
  const allowedBusinessIds = ctx.businesses.map((b) => b.businessId).filter((x): x is string => !!x);
  try {
    await svc.deleteReviewByBuyer(c.env.DB, c.req.param('id'), { userId: ctx.userId, allowedBusinessIds });
    analytics.emit('review_deleted', { reviewId: c.req.param('id') });
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.post('/reviews/:id/helpful', async (c) => {
  const ctx = ctxOf(c);
  try {
    await svc.toggleHelpful(c.env.DB, c.req.param('id'), ctx.userId, true);
    analytics.emit('review_helpful', { reviewId: c.req.param('id'), on: true });
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.delete('/reviews/:id/helpful', async (c) => {
  const ctx = ctxOf(c);
  try {
    await svc.toggleHelpful(c.env.DB, c.req.param('id'), ctx.userId, false);
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.post('/reviews/images/upload-direct', async (c) => {
  if (!(await isReviewsEnabled(c.env.DB))) throw httpError(404, 'NOT_FOUND', 'Reviews disabled');
  ctxOf(c);
  const form = await c.req.parseBody();
  const file = form['file'];
  if (!(file instanceof File)) throw httpError(400, 'VALIDATION_ERROR', 'file required');
  if (!file.type.startsWith('image/')) throw httpError(400, 'VALIDATION_ERROR', 'image only');
  if (file.size > 5 * 1024 * 1024) throw httpError(400, 'VALIDATION_ERROR', 'max 5MB');
  const { sanitizeFilename } = await import('../documents/repository');
  const key = `reviews/tmp/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  await c.env.PRODUCTS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  analytics.emit('review_photo_added', { r2Key: key });
  return c.json({ r2Key: key }, 201);
});

function mapStatus(code: svc.ReviewErrorCode): number {
  switch (code) {
    case 'not_buyer':
      return 403;
    case 'already_reviewed':
    case 'dispute_open':
      return 409;
    case 'not_delivered':
      return 422;
    case 'not_found':
      return 404;
    case 'not_supplier_owner':
    case 'not_admin':
      return 403;
    default:
      return 400;
  }
}

function mapErrorCode(code: svc.ReviewErrorCode): ErrorCode {
  switch (code) {
    case 'not_buyer':
    case 'not_supplier_owner':
    case 'not_admin':
      return 'FORBIDDEN';
    case 'already_reviewed':
    case 'dispute_open':
      return 'CONFLICT';
    case 'not_delivered':
      return 'VALIDATION_ERROR';
    case 'not_found':
      return 'NOT_FOUND';
  }
}

export default router;