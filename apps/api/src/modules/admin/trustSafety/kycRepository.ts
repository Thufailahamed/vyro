import { getDb } from '@vyro/db';
import { kycReviews } from '@vyro/db/schema';
import { and, eq, lt, desc } from 'drizzle-orm';

export type KycRow = {
  id: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_more_info';
  documentsJson: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
};

export async function listKyc(
  d1: D1Database,
  opts: {
    status?: 'pending' | 'approved' | 'rejected' | 'needs_more_info' | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
): Promise<{ items: KycRow[]; nextCursor: string | null }> {
  const db = getDb(d1);
  const limit = opts.limit ?? 50;
  const where = and(
    opts.status ? eq(kycReviews.status, opts.status) : undefined,
    opts.cursor ? lt(kycReviews.createdAt, Number(opts.cursor)) : undefined,
  );
  const rows = (await db
    .select()
    .from(kycReviews)
    .where(where)
    .orderBy(desc(kycReviews.createdAt))
    .limit(limit + 1)
    .all()) as KycRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? String(items[items.length - 1]!.createdAt) : null };
}

export async function getKyc(d1: D1Database, id: string): Promise<KycRow | null> {
  const db = getDb(d1);
  const row = (await db.select().from(kycReviews).where(eq(kycReviews.id, id)).get()) as
    | KycRow
    | undefined;
  return row ?? null;
}

export async function findKycByUser(d1: D1Database, userId: string): Promise<KycRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(kycReviews)
    .where(eq(kycReviews.userId, userId))
    .orderBy(desc(kycReviews.createdAt))
    .limit(1)
    .get()) as KycRow | undefined;
  return row ?? null;
}

export async function createKyc(
  d1: D1Database,
  body: { id: string; userId: string; documentsJson: string | null; createdAt: number },
): Promise<KycRow> {
  await getDb(d1)
    .insert(kycReviews)
    .values({
      id: body.id,
      userId: body.userId,
      status: 'pending',
      documentsJson: body.documentsJson,
      notes: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: body.createdAt,
    })
    .run();
  return {
    id: body.id,
    userId: body.userId,
    status: 'pending',
    documentsJson: body.documentsJson,
    notes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: body.createdAt,
  };
}

export async function decideKyc(
  d1: D1Database,
  id: string,
  decision: 'approved' | 'rejected' | 'needs_more_info',
  notes: string | null,
  reviewerId: string,
): Promise<{ before: KycRow; after: KycRow } | null> {
  const before = await getKyc(d1, id);
  if (!before) return null;
  const reviewedAt = Date.now();
  await getDb(d1)
    .update(kycReviews)
    .set({ status: decision, notes, reviewedBy: reviewerId, reviewedAt })
    .where(eq(kycReviews.id, id))
    .run();
  return {
    before,
    after: { ...before, status: decision, notes, reviewedBy: reviewerId, reviewedAt },
  };
}
