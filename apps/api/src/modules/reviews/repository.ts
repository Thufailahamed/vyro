import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  supplierReviews,
  supplierReviewReplies,
  supplierReviewFlags,
  supplierReviewImages,
  supplierReviewHelpfulVotes,
  suppliers,
} from '@vyro/db/schema';

export type ReviewStatus =
  | 'published'
  | 'hidden_by_flag'
  | 'hidden_by_dispute'
  | 'removed_by_admin'
  | 'removed_by_buyer';
export type FlagReason = 'abuse' | 'spam' | 'off_topic' | 'pii' | 'other';
export type FlaggerRole = 'buyer' | 'supplier' | 'admin' | 'system';

export async function findReviewById(d1: D1Database, id: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierReviews)
    .where(eq(supplierReviews.id, id))
    .get()) as any;
}

export async function findReviewByOrder(d1: D1Database, supplierId: string, orderId: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierReviews)
    .where(and(eq(supplierReviews.supplierId, supplierId), eq(supplierReviews.orderId, orderId)))
    .get()) as any;
}

export async function insertReview(
  d1: D1Database,
  input: {
    supplierId: string;
    orderId: string;
    buyerBusinessId: string;
    rating: number;
    body: string;
    now: number;
  },
) {
  const db = getDb(d1);
  const id = crypto.randomUUID();
  const row = {
    id,
    supplierId: input.supplierId,
    orderId: input.orderId,
    buyerBusinessId: input.buyerBusinessId,
    rating: input.rating,
    body: input.body,
    status: 'published' as const,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return (await db.insert(supplierReviews).values(row).returning().get()) as any;
}

export async function listReviews(
  d1: D1Database,
  supplierId: string,
  opts: { sort: 'recent' | 'highest' | 'lowest'; limit: number; cursor?: string | undefined },
) {
  const db = getDb(d1);
  const orderBy =
    opts.sort === 'highest'
      ? [desc(supplierReviews.rating), desc(supplierReviews.createdAt)]
      : opts.sort === 'lowest'
        ? [asc(supplierReviews.rating), desc(supplierReviews.createdAt)]
        : [desc(supplierReviews.createdAt)];

  const where = and(
    eq(supplierReviews.supplierId, supplierId),
    eq(supplierReviews.status, 'published' as never),
    opts.cursor
      ? lt(
          supplierReviews.createdAt,
          sql`(SELECT created_at FROM supplier_reviews WHERE id = ${opts.cursor})`,
        )
      : undefined,
  );

  return (await db
    .select()
    .from(supplierReviews)
    .where(where)
    .orderBy(...orderBy)
    .limit(opts.limit)
    .all()) as any[];
}

export async function aggregateForSupplier(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  const rows = (await db
    .select({ rating: supplierReviews.rating, createdAt: supplierReviews.createdAt })
    .from(supplierReviews)
    .where(
      and(
        eq(supplierReviews.supplierId, supplierId),
        eq(supplierReviews.status, 'published' as never),
      ),
    )
    .all()) as Array<{ rating: number; createdAt: number }>;

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let lastReviewAt: number | null = null;
  for (const r of rows) {
    const k = r.rating as 1 | 2 | 3 | 4 | 5;
    distribution[k] += 1;
    sum += r.rating;
    if (lastReviewAt === null || r.createdAt > lastReviewAt) lastReviewAt = r.createdAt;
  }
  const count = rows.length;
  return {
    count,
    avg: count ? sum / count : null,
    avgX100: count ? Math.round((sum / count) * 100) : 0,
    lastReviewAt,
    distribution,
  };
}

export async function setSupplierReviewAggregate(
  d1: D1Database,
  supplierId: string,
  agg: { count: number; avgX100: number; lastReviewAt: number | null },
  now: number,
) {
  const db = getDb(d1);
  return db
    .update(suppliers)
    .set({
      reviewCount: agg.count,
      reviewAvg: agg.avgX100,
      lastReviewAt: agg.lastReviewAt,
      updatedAt: now,
    })
    .where(eq(suppliers.id, supplierId))
    .run();
}

export async function updateReviewStatus(
  d1: D1Database,
  id: string,
  status: ReviewStatus,
  now: number,
) {
  const db = getDb(d1);
  return (await db
    .update(supplierReviews)
    .set({ status, updatedAt: now })
    .where(eq(supplierReviews.id, id))
    .returning()
    .get()) as any;
}

export async function updateReviewsForOrderByStatus(
  d1: D1Database,
  orderId: string,
  fromStatus: ReviewStatus,
  toStatus: ReviewStatus,
  now: number,
): Promise<number> {
  const db = getDb(d1);
  const result = await db
    .update(supplierReviews)
    .set({ status: toStatus, updatedAt: now })
    .where(
      and(
        eq(supplierReviews.orderId, orderId),
        eq(supplierReviews.status, fromStatus as never),
      ),
    )
    .run();
  return Number(result.meta?.changes ?? 0);
}

export async function distinctSupplierIdsForOrder(d1: D1Database, orderId: string): Promise<string[]> {
  const db = getDb(d1);
  const rows = (await db
    .selectDistinct({ supplierId: supplierReviews.supplierId })
    .from(supplierReviews)
    .where(eq(supplierReviews.orderId, orderId))
    .all()) as Array<{ supplierId: string }>;
  return rows.map((r) => r.supplierId);
}

export async function insertReply(
  d1: D1Database,
  input: { reviewId: string; supplierId: string; body: string; now: number },
) {
  const db = getDb(d1);
  const id = crypto.randomUUID();
  const row = {
    id,
    reviewId: input.reviewId,
    supplierId: input.supplierId,
    body: input.body,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return (await db.insert(supplierReviewReplies).values(row).returning().get()) as any;
}

export async function findReplyByReview(d1: D1Database, reviewId: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierReviewReplies)
    .where(eq(supplierReviewReplies.reviewId, reviewId))
    .get()) as any;
}

export async function insertFlag(
  d1: D1Database,
  input: {
    reviewId: string;
    flaggedBy: FlaggerRole;
    flaggedByUserId?: string;
    reason: FlagReason;
    note?: string;
    now: number;
  },
) {
  const db = getDb(d1);
  const id = crypto.randomUUID();
  const row = {
    id,
    reviewId: input.reviewId,
    flaggedBy: input.flaggedBy,
    flaggedByUserId: input.flaggedByUserId ?? null,
    reason: input.reason,
    note: input.note ?? null,
    status: 'pending' as const,
    createdAt: input.now,
    resolvedAt: null,
    resolvedBy: null,
  };
  return (await db.insert(supplierReviewFlags).values(row).returning().get()) as any;
}

export async function findFlagById(d1: D1Database, id: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierReviewFlags)
    .where(eq(supplierReviewFlags.id, id))
    .get()) as any;
}

export async function listPendingFlags(d1: D1Database, limit: number, cursor?: string | undefined) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierReviewFlags)
    .where(
      and(
        eq(supplierReviewFlags.status, 'pending' as never),
        cursor
          ? lt(
              supplierReviewFlags.createdAt,
              sql`(SELECT created_at FROM supplier_review_flags WHERE id = ${cursor})`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(supplierReviewFlags.createdAt), asc(supplierReviewFlags.id))
    .limit(limit)
    .all()) as any[];
}

export async function flagBurstBySupplier(
  d1: D1Database,
  sinceMs: number,
  minCount: number,
): Promise<Array<{ supplierId: string; flagCount: number }>> {
  const db = getDb(d1);
  return (await db
    .select({
      supplierId: supplierReviews.supplierId,
      flagCount: sql<number>`COUNT(*)`.as('flag_count'),
    })
    .from(supplierReviewFlags)
    .innerJoin(supplierReviews, eq(supplierReviewFlags.reviewId, supplierReviews.id))
    .where(
      and(
        sql`${supplierReviewFlags.createdAt} >= ${sinceMs}`,
        eq(supplierReviewFlags.status, 'pending' as never),
      ),
    )
    .groupBy(supplierReviews.supplierId)
    .having(sql`COUNT(*) >= ${minCount}`)
    .all()) as any[];
}

export async function updateFlag(
  d1: D1Database,
  id: string,
  decision: 'resolved_keep' | 'resolved_remove',
  adminUserId: string,
  now: number,
) {
  const db = getDb(d1);
  return (await db
    .update(supplierReviewFlags)
    .set({ status: decision, resolvedAt: now, resolvedBy: adminUserId })
    .where(eq(supplierReviewFlags.id, id))
    .returning()
    .get()) as any;
}

export async function adminDeleteReview(
  d1: D1Database,
  reviewId: string,
  adminUserId: string,
  now: number,
) {
  const db = getDb(d1);
  await db
    .update(supplierReviews)
    .set({ status: 'removed_by_admin', updatedAt: now })
    .where(eq(supplierReviews.id, reviewId))
    .run();
  // Note: supplierId for aggregate recompute is the caller's responsibility
  // (route layer reads review first then recomputes). Kept minimal here.
  void adminUserId; // reserved for future audit hook
}

export async function findImagesByReviewIds(d1: D1Database, ids: string[]) {
  if (!ids.length) return [];
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierReviewImages)
    .where(inArray(supplierReviewImages.reviewId, ids))
    .all()) as any[];
}

export async function findRepliesByReviewIds(d1: D1Database, ids: string[]) {
  if (!ids.length) return [];
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierReviewReplies)
    .where(inArray(supplierReviewReplies.reviewId, ids))
    .all()) as any[];
}

export async function findOpenFlagByReview(d1: D1Database, reviewId: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierReviewFlags)
    .where(
      and(
        eq(supplierReviewFlags.reviewId, reviewId),
        eq(supplierReviewFlags.status, 'pending' as never),
      ),
    )
    .get()) as any;
}

export async function updateReview(
  d1: D1Database,
  id: string,
  patch: { rating: number; body: string; editedAt: number; updatedAt: number },
) {
  const db = getDb(d1);
  return (await db
    .update(supplierReviews)
    .set({
      rating: patch.rating,
      body: patch.body,
      editedAt: patch.editedAt,
      updatedAt: patch.updatedAt,
    })
    .where(eq(supplierReviews.id, id))
    .returning()
    .get()) as any;
}

export async function addHelpful(d1: D1Database, reviewId: string, userId: string, now: number) {
  const db = getDb(d1);
  try {
    await db
      .insert(supplierReviewHelpfulVotes)
      .values({ reviewId, userId, createdAt: now })
      .run();
  } catch {
    // duplicate = already voted
  }
  await db
    .update(supplierReviews)
    .set({ helpfulCount: sql`COALESCE(helpful_count,0)+1` })
    .where(eq(supplierReviews.id, reviewId))
    .run();
}

export async function removeHelpful(d1: D1Database, reviewId: string, userId: string) {
  const db = getDb(d1);
  await db
    .delete(supplierReviewHelpfulVotes)
    .where(
      and(
        eq(supplierReviewHelpfulVotes.reviewId, reviewId),
        eq(supplierReviewHelpfulVotes.userId, userId),
      ),
    )
    .run();
  await db
    .update(supplierReviews)
    .set({ helpfulCount: sql`MAX(COALESCE(helpful_count,1)-1,0)` })
    .where(eq(supplierReviews.id, reviewId))
    .run();
}