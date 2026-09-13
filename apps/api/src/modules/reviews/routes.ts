import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import { httpError, type ErrorCode } from '../../lib/errors';
import type { Env } from '../../env';
import {
  adminFlagsQuerySchema,
  flagSchema,
  replySchema,
  resolveFlagSchema,
  reviewListQuerySchema,
  submitReviewSchema,
} from '@vyro/validation';
import { hasSupplierAccess } from '@vyro/auth';
import * as svc from './service';
import * as repo from './repository';
import * as analytics from './analytics';
import * as cfgSvc from '../admin/platform/configSectionsService';

const router = new Hono<{ Bindings: Env }>();

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
    analytics.emit('review_submitted', { reviewId: review.id, supplierId: review.supplierId, rating: review.rating });
    return c.json({ review }, 201);
  } catch (e) {
    if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message);
    throw e;
  }
});

router.get('/suppliers/:id/reviews', async (c) => {
  const q = reviewListQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query', q.error.flatten());
  const items = await repo.listReviews(c.env.DB, c.req.param('id'), q.data);
  return c.json({ reviews: items, nextCursor: items.length === q.data.limit ? items[items.length - 1].id : null });
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