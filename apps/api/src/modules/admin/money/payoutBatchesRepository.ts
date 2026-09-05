import { getDb } from '@vyro/db';
import { payoutBatches, payouts } from '@vyro/db/schema';
import { and, eq, lt, desc } from 'drizzle-orm';

export type PayoutBatchRow = {
  id: string;
  createdBy: string;
  approvedBy: string | null;
  status: 'pending' | 'approved' | 'rejected';
  totalCents: number;
  note: string | null;
  createdAt: number;
  approvedAt: number | null;
};

export async function listPendingBatches(
  d1: D1Database,
  opts: { cursor?: string; limit?: number },
): Promise<{ items: PayoutBatchRow[]; nextCursor: string | null }> {
  const db = getDb(d1);
  const limit = opts.limit ?? 50;
  const rows = (await db
    .select()
    .from(payoutBatches)
    .where(
      and(
        eq(payoutBatches.status, 'pending'),
        opts.cursor ? lt(payoutBatches.createdAt, Number(opts.cursor)) : undefined,
      ),
    )
    .orderBy(desc(payoutBatches.createdAt))
    .limit(limit + 1)
    .all()) as PayoutBatchRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? String(items[items.length - 1]!.createdAt) : null };
}

export async function getBatch(d1: D1Database, id: string): Promise<PayoutBatchRow | null> {
  const db = getDb(d1);
  const row = (await db.select().from(payoutBatches).where(eq(payoutBatches.id, id)).get()) as
    | PayoutBatchRow
    | undefined;
  return row ?? null;
}

export async function createBatch(
  d1: D1Database,
  data: { id: string; createdBy: string; note: string | null; totalCents: number },
): Promise<PayoutBatchRow> {
  const db = getDb(d1);
  const row: PayoutBatchRow = {
    id: data.id,
    createdBy: data.createdBy,
    approvedBy: null,
    status: 'pending',
    totalCents: data.totalCents,
    note: data.note,
    createdAt: Date.now(),
    approvedAt: null,
  };
  await db.insert(payoutBatches).values(row).run();
  return row;
}

export async function approveBatch(
  d1: D1Database,
  id: string,
  approvedBy: string,
): Promise<{ before: PayoutBatchRow; after: PayoutBatchRow } | null> {
  const db = getDb(d1);
  const before = await getBatch(d1, id);
  if (!before) return null;
  await db
    .update(payoutBatches)
    .set({ status: 'approved', approvedBy, approvedAt: Date.now() })
    .where(eq(payoutBatches.id, id))
    .run();
  return {
    before,
    after: { ...before, status: 'approved', approvedBy, approvedAt: Date.now() },
  };
}

export async function pendingPayoutTotalCents(d1: D1Database): Promise<number> {
  const db = getDb(d1);
  const rows = await db
    .select({ netCents: payouts.netCents })
    .from(payouts)
    .where(eq(payouts.status, 'pending'))
    .all();
  return rows.reduce((acc, r) => acc + (r.netCents ?? 0), 0);
}
