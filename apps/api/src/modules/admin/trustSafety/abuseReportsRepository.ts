import { getDb } from '@vyro/db';
import { abuseReports } from '@vyro/db/schema';
import { and, eq, lt, desc, isNull } from 'drizzle-orm';

export type AbuseReportRow = {
  id: string;
  reporterUserId: string | null;
  targetType: 'user' | 'business' | 'supplier' | 'product' | 'review';
  targetId: string;
  reason: 'spam' | 'fraud' | 'harassment' | 'misinformation' | 'other';
  details: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  assignedTo: string | null;
  resolutionNotes: string | null;
  createdAt: number;
  updatedAt: number;
};

export async function listReports(
  d1: D1Database,
  opts: {
    status?: 'open' | 'investigating' | 'resolved' | 'dismissed' | undefined;
    unassigned?: boolean | undefined;
    assignedTo?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
): Promise<{ items: AbuseReportRow[]; nextCursor: string | null }> {
  const db = getDb(d1);
  const limit = opts.limit ?? 50;
  const where = and(
    opts.status ? eq(abuseReports.status, opts.status) : undefined,
    opts.unassigned ? isNull(abuseReports.assignedTo) : undefined,
    opts.assignedTo ? eq(abuseReports.assignedTo, opts.assignedTo) : undefined,
    opts.cursor ? lt(abuseReports.createdAt, Number(opts.cursor)) : undefined,
  );
  const rows = (await db
    .select()
    .from(abuseReports)
    .where(where)
    .orderBy(desc(abuseReports.createdAt))
    .limit(limit + 1)
    .all()) as AbuseReportRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? String(items[items.length - 1]!.createdAt) : null };
}

export async function getReport(d1: D1Database, id: string): Promise<AbuseReportRow | null> {
  const db = getDb(d1);
  const row = (await db.select().from(abuseReports).where(eq(abuseReports.id, id)).get()) as
    | AbuseReportRow
    | undefined;
  return row ?? null;
}

export async function claimReport(
  d1: D1Database,
  id: string,
  assignedTo: string,
): Promise<{ before: AbuseReportRow; after: AbuseReportRow } | null> {
  const before = await getReport(d1, id);
  if (!before) return null;
  const after: AbuseReportRow = {
    ...before,
    assignedTo,
    status: 'investigating',
    updatedAt: Date.now(),
  };
  await getDb(d1)
    .update(abuseReports)
    .set({ assignedTo, status: 'investigating', updatedAt: after.updatedAt })
    .where(eq(abuseReports.id, id))
    .run();
  return { before, after };
}

export async function resolveReport(
  d1: D1Database,
  id: string,
  resolution: 'resolved' | 'dismissed',
  notes: string | null,
): Promise<{ before: AbuseReportRow; after: AbuseReportRow } | null> {
  const before = await getReport(d1, id);
  if (!before) return null;
  const updatedAt = Date.now();
  await getDb(d1)
    .update(abuseReports)
    .set({
      status: resolution,
      resolutionNotes: notes,
      updatedAt,
    })
    .where(eq(abuseReports.id, id))
    .run();
  const after: AbuseReportRow = {
    ...before,
    status: resolution,
    resolutionNotes: notes,
    updatedAt,
  };
  return { before, after };
}

export async function setReportInactiveTarget(
  d1: D1Database,
  id: string,
): Promise<AbuseReportRow | null> {
  const before = await getReport(d1, id);
  if (!before) return null;
  const updatedAt = Date.now();
  await getDb(d1)
    .update(abuseReports)
    .set({ status: 'resolved', resolutionNotes: 'takedown', updatedAt })
    .where(eq(abuseReports.id, id))
    .run();
  return { ...before, status: 'resolved', resolutionNotes: 'takedown', updatedAt };
}
