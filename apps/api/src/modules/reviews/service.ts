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

type BuyerSession = { userId: string; businessId: string; role: 'buyer' };

async function loadOrderForBuyer(d1: D1Database, orderId: string, buyerBusinessId: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.businessId, buyerBusinessId)))
    .get()) as any;
}

export async function checkEligibility(
  d1: D1Database,
  orderId: string,
  session: BuyerSession,
): Promise<{ canReview: boolean; reason: ReviewErrorCode | null; supplierId?: string }> {
  const order = await loadOrderForBuyer(d1, orderId, session.businessId);
  if (!order) return { canReview: false, reason: 'not_buyer' };
  if (order.status !== 'delivered') return { canReview: false, reason: 'not_delivered' };
  if (order.status === 'disputed') return { canReview: false, reason: 'dispute_open' };
  const existing = await repo.findReviewByOrder(d1, order.supplierId, orderId);
  if (existing) return { canReview: false, reason: 'already_reviewed' };
  return { canReview: true, reason: null, supplierId: order.supplierId };
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
    buyerBusinessId: session.businessId,
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