import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import { httpError, type ErrorCode } from '../../lib/errors';
import type { Env } from '../../env';
import {
  reviewListQuerySchema,
  submitReviewSchema,
} from '@vyro/validation';
import * as svc from './service';
import * as repo from './repository';

const router = new Hono<{ Bindings: Env }>();

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

router.post('/reviews', async (c) => {
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