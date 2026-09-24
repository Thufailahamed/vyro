import { eq, and } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import { nowMs } from '@vyro/shared';
import * as repo from './repository';
import type { FlagReason, FlaggerRole } from './repository';

export type ReviewErrorCode =
  | 'not_buyer'
  | 'not_delivered'
  | 'dispute_open'
  | 'already_reviewed'
  | 'not_supplier_owner'
  | 'not_admin'
  | 'not_found';

export class ReviewError extends Error {
  constructor(public code: ReviewErrorCode) {
    super(code);
  }
}

type BuyerSession = { userId: string; allowedBusinessIds: string[]; role: 'buyer' };

async function loadOrderForBuyer(d1: D1Database, orderId: string, allowedBusinessIds: string[]) {
  if (allowedBusinessIds.length === 0) return null;
  const db = getDb(d1);
  return (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, orderId))
    .get()) as any;
}

function buyerOwnsOrder(order: any, allowedBusinessIds: string[]): boolean {
  return !!order && allowedBusinessIds.includes(order.businessId);
}

export async function checkEligibility(
  d1: D1Database,
  orderId: string,
  session: BuyerSession,
): Promise<{ canReview: boolean; reason: ReviewErrorCode | null; supplierId?: string; buyerBusinessId?: string }> {
  const order = await loadOrderForBuyer(d1, orderId, session.allowedBusinessIds);
  if (!buyerOwnsOrder(order, session.allowedBusinessIds)) return { canReview: false, reason: 'not_buyer' };
  if (order.status === 'disputed' || (order as any).disputeId) return { canReview: false, reason: 'dispute_open' };
  if (order.status !== 'delivered') return { canReview: false, reason: 'not_delivered' };
  const existing = await repo.findReviewByOrder(d1, order.supplierId, orderId);
  if (existing) return { canReview: false, reason: 'already_reviewed' };
  return { canReview: true, reason: null, supplierId: order.supplierId, buyerBusinessId: order.businessId };
}

export async function submitReview(
  d1: D1Database,
  input: { orderId: string; rating: number; body: string },
  session: BuyerSession,
) {
  const elig = await checkEligibility(d1, input.orderId, session);
  if (!elig.canReview) throw new ReviewError(elig.reason!);

  const now = nowMs();
  const review = await repo.insertReview(d1, {
    supplierId: elig.supplierId!,
    orderId: input.orderId,
    buyerBusinessId: elig.buyerBusinessId!,
    rating: input.rating,
    body: input.body,
    now,
  });

  await recomputeAggregate(d1, elig.supplierId!);
  return review;
}

export async function recomputeAggregate(d1: D1Database, supplierId: string) {
  const agg = await repo.aggregateForSupplier(d1, supplierId);
  await repo.setSupplierReviewAggregate(
    d1,
    supplierId,
    { count: agg.count, avgX100: agg.avgX100, lastReviewAt: agg.lastReviewAt },
    nowMs(),
  );
  return agg;
}

// Re-export for downstream callers.
export type { FlagReason, FlaggerRole };

type SupplierSession = { userId: string; supplierId: string; role: 'supplier' };
type AdminSession = { userId: string; role: 'admin' };

export async function postReply(
  d1: D1Database,
  supplierId: string,
  reviewId: string,
  body: string,
  session: SupplierSession,
) {
  if (session.supplierId !== supplierId) throw new ReviewError('not_supplier_owner');
  const review = await repo.findReviewById(d1, reviewId);
  if (!review || review.supplierId !== supplierId) throw new ReviewError('not_found');
  const existing = await repo.findReplyByReview(d1, reviewId);
  if (existing) throw new ReviewError('already_reviewed'); // already replied
  const now = nowMs();
  return repo.insertReply(d1, { reviewId, supplierId, body, now });
}

export async function flagReview(
  d1: D1Database,
  supplierId: string,
  reviewId: string,
  input: { reason: FlagReason; note?: string | undefined },
  session: SupplierSession,
) {
  if (session.supplierId !== supplierId) throw new ReviewError('not_supplier_owner');
  const review = await repo.findReviewById(d1, reviewId);
  if (!review || review.supplierId !== supplierId) throw new ReviewError('not_found');
  const open = await repo.findOpenFlagByReview(d1, reviewId);
  if (open) throw new ReviewError('already_reviewed');
  const now = nowMs();
  const flag = await repo.insertFlag(d1, {
    reviewId,
    flaggedBy: 'supplier' as FlaggerRole,
    flaggedByUserId: session.userId,
    reason: input.reason,
    ...(input.note ? { note: input.note } : {}),
    now,
  });
  await repo.updateReviewStatus(d1, reviewId, 'hidden_by_flag', now);
  return flag;
}

export async function resolveFlag(
  d1: D1Database,
  flagId: string,
  input: { decision: 'keep' | 'remove'; note?: string | undefined },
  session: AdminSession,
) {
  if (session.role !== 'admin') throw new ReviewError('not_admin');
  const flagRow = await repo.findFlagById(d1, flagId);
  if (!flagRow) throw new ReviewError('not_found');
  const now = nowMs();
  const decision = input.decision === 'keep' ? 'resolved_keep' : 'resolved_remove';
  await repo.updateFlag(d1, flagId, decision, session.userId, now);
  if (input.decision === 'keep') {
    await repo.updateReviewStatus(d1, flagRow.reviewId, 'published', now);
  } else {
    await repo.updateReviewStatus(d1, flagRow.reviewId, 'removed_by_admin', now);
  }
  // Look up supplierId via review for aggregate recompute.
  const review = await repo.findReviewById(d1, flagRow.reviewId);
  if (review) await recomputeAggregate(d1, review.supplierId);
}

export async function editReview(
  d1: D1Database,
  reviewId: string,
  input: { rating: number; body: string },
  session: { userId: string; allowedBusinessIds: string[] },
) {
  const review = await repo.findReviewById(d1, reviewId);
  if (!review) throw new ReviewError('not_found');
  const db = getDb(d1);
  const order = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, review.orderId))
    .get()) as any;
  if (!order || !session.allowedBusinessIds.includes(order.businessId)) throw new ReviewError('not_buyer');
  if (review.status !== 'published') throw new ReviewError('not_found');
  if (Date.now() - review.createdAt > 7 * 24 * 3600 * 1000) throw new ReviewError('already_reviewed');
  const now = nowMs();
  const updated = await repo.updateReview(d1, reviewId, {
    rating: input.rating,
    body: input.body,
    editedAt: now,
    updatedAt: now,
  });
  await recomputeAggregate(d1, review.supplierId);
  return updated;
}

export async function deleteReviewByBuyer(
  d1: D1Database,
  reviewId: string,
  session: { userId: string; allowedBusinessIds: string[] },
) {
  const review = await repo.findReviewById(d1, reviewId);
  if (!review) throw new ReviewError('not_found');
  const db = getDb(d1);
  const order = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, review.orderId))
    .get()) as any;
  if (!order || !session.allowedBusinessIds.includes(order.businessId)) throw new ReviewError('not_buyer');
  await repo.updateReviewStatus(d1, reviewId, 'removed_by_buyer', nowMs());
  await recomputeAggregate(d1, review.supplierId);
}

export async function toggleHelpful(d1: D1Database, reviewId: string, userId: string, on: boolean) {
  const review = await repo.findReviewById(d1, reviewId);
  if (!review) throw new ReviewError('not_found');
  if (on) await repo.addHelpful(d1, reviewId, userId, nowMs());
  else await repo.removeHelpful(d1, reviewId, userId);
}

/**
 * Hide all currently-published reviews for an order when a dispute opens.
 * Idempotent: only flips rows currently `published`, leaving flag/admin
 * removals untouched. Returns number of rows updated.
 */
export async function markOrderDisputed(d1: D1Database, orderId: string): Promise<number> {
  const now = nowMs();
  const n = await repo.updateReviewsForOrderByStatus(
    d1,
    orderId,
    'published',
    'hidden_by_dispute',
    now,
  );
  if (n > 0) {
    const supplierIds = await repo.distinctSupplierIdsForOrder(d1, orderId);
    for (const sid of supplierIds) await recomputeAggregate(d1, sid);
  }
  return n;
}

/**
 * Restore dispute-hidden reviews when dispute resolves. Idempotent:
 * only flips rows currently `hidden_by_dispute`; never un-hides
 * `removed_by_admin` or `hidden_by_flag`.
 */
export async function markOrderResolved(d1: D1Database, orderId: string): Promise<number> {
  const now = nowMs();
  const n = await repo.updateReviewsForOrderByStatus(
    d1,
    orderId,
    'hidden_by_dispute',
    'published',
    now,
  );
  if (n > 0) {
    const supplierIds = await repo.distinctSupplierIdsForOrder(d1, orderId);
    for (const sid of supplierIds) await recomputeAggregate(d1, sid);
  }
  return n;
}