import { getDb } from '@vyro/db';
import { refunds } from '@vyro/db/schema';
import { and, eq, lt, desc } from 'drizzle-orm';

export type RefundRow = {
  id: string;
  paymentId: string;
  amountCents: number;
  reason: string | null;
  status: 'requested' | 'approved' | 'processing' | 'completed' | 'failed' | 'rejected' | 'cancelled';
  requestedByUserId: string;
  createdAt: number;
};

export async function listRefundQueue(
  d1: D1Database,
  opts: { cursor?: string | undefined; limit?: number | undefined },
): Promise<{ items: RefundRow[]; nextCursor: string | null }> {
  const db = getDb(d1);
  const limit = opts.limit ?? 50;
  const rows = (await db
    .select({
      id: refunds.id,
      paymentId: refunds.paymentId,
      amountCents: refunds.amountCents,
      reason: refunds.reason,
      status: refunds.status,
      requestedByUserId: refunds.requestedByUserId,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .where(
      and(
        opts.cursor ? lt(refunds.createdAt, Number(opts.cursor)) : undefined,
      ),
    )
    .orderBy(desc(refunds.createdAt))
    .limit(limit + 1)
    .all()) as RefundRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? String(items[items.length - 1]!.createdAt) : null };
}

export async function getRefund(d1: D1Database, id: string): Promise<RefundRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select({
      id: refunds.id,
      paymentId: refunds.paymentId,
      amountCents: refunds.amountCents,
      reason: refunds.reason,
      status: refunds.status,
      requestedByUserId: refunds.requestedByUserId,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .where(eq(refunds.id, id))
    .get()) as RefundRow | undefined;
  return row ?? null;
}

export async function setRefundStatus(
  d1: D1Database,
  id: string,
  status: 'approved' | 'processing' | 'completed' | 'failed' | 'rejected' | 'cancelled',
): Promise<RefundRow | null> {
  const db = getDb(d1);
  const before = await getRefund(d1, id);
  if (!before) return null;
  await db
    .update(refunds)
    .set({ status, processedAt: Date.now(), updatedAt: Date.now() })
    .where(eq(refunds.id, id))
    .run();
  return { ...before, status };
}
