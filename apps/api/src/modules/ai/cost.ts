import { getDb } from '@vyro/db';
import { auditLogs } from '@vyro/db/schema';
import { and, eq, gte, lt, sql } from 'drizzle-orm';

export interface CostBucket {
  day: string; // YYYY-MM-DD UTC
  calls: number;
  tokensIn: number;
  tokensOut: number;
  errors: number;
}

export interface CostSummary {
  fromMs: number;
  toMs: number;
  totals: { calls: number; tokensIn: number; tokensOut: number; errors: number };
  byDay: CostBucket[];
  byIntent: Array<{ intent: string; calls: number; tokensIn: number; tokensOut: number }>;
  byProvider: Array<{ provider: string; calls: number; tokensIn: number; tokensOut: number }>;
}

/**
 * summarizeAiCost: aggregate ai.request audit rows for a business over a
 * window. Returns totals, daily bucket, intent breakdown, provider breakdown.
 *
 * Reads only audit_logs via Drizzle's json_extract; no new tables needed.
 * Used by the admin /api/ai/usage endpoint and the admin dashboard widget.
 */
export async function summarizeAiCost(
  env: { DB: D1Database },
  opts: { businessId: string; fromMs: number; toMs: number },
): Promise<CostSummary> {
  const db = getDb(env.DB);
  const totalRow = await db
    .select({
      calls: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(coalesce(nullif(json_extract(${auditLogs.metadata}, '$.tokensIn'), ''), 0)), 0)`,
      tokensOut: sql<number>`coalesce(sum(coalesce(nullif(json_extract(${auditLogs.metadata}, '$.tokensOut'), ''), 0)), 0)`,
      errors: sql<number>`coalesce(sum(case when json_extract(${auditLogs.metadata}, '$.ok') in ('false', 0) then 1 else 0 end), 0)`,
    })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.action, 'ai.request'),
      eq(auditLogs.resourceType, 'ai_request'),
      eq(sql`json_extract(${auditLogs.metadata}, '$.businessId')`, opts.businessId),
      gte(auditLogs.createdAt, opts.fromMs),
      lt(auditLogs.createdAt, opts.toMs),
    ))
    .get();

  const dayRows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${auditLogs.createdAt} / 1000, 'unixepoch')`,
      calls: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(coalesce(nullif(json_extract(${auditLogs.metadata}, '$.tokensIn'), ''), 0)), 0)`,
      tokensOut: sql<number>`coalesce(sum(coalesce(nullif(json_extract(${auditLogs.metadata}, '$.tokensOut'), ''), 0)), 0)`,
      errors: sql<number>`coalesce(sum(case when json_extract(${auditLogs.metadata}, '$.ok') in ('false', 0) then 1 else 0 end), 0)`,
    })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.action, 'ai.request'),
      eq(auditLogs.resourceType, 'ai_request'),
      eq(sql`json_extract(${auditLogs.metadata}, '$.businessId')`, opts.businessId),
      gte(auditLogs.createdAt, opts.fromMs),
      lt(auditLogs.createdAt, opts.toMs),
    ))
    .groupBy(sql`strftime('%Y-%m-%d', ${auditLogs.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`strftime('%Y-%m-%d', ${auditLogs.createdAt} / 1000, 'unixepoch')`)
    .all();

  const intentRows = await db
    .select({
      intent: sql<string>`json_extract(${auditLogs.metadata}, '$.intent')`,
      calls: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(coalesce(nullif(json_extract(${auditLogs.metadata}, '$.tokensIn'), ''), 0)), 0)`,
      tokensOut: sql<number>`coalesce(sum(coalesce(nullif(json_extract(${auditLogs.metadata}, '$.tokensOut'), ''), 0)), 0)`,
    })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.action, 'ai.request'),
      eq(auditLogs.resourceType, 'ai_request'),
      eq(sql`json_extract(${auditLogs.metadata}, '$.businessId')`, opts.businessId),
      gte(auditLogs.createdAt, opts.fromMs),
      lt(auditLogs.createdAt, opts.toMs),
    ))
    .groupBy(sql`json_extract(${auditLogs.metadata}, '$.intent')`)
    .orderBy(sql`count(*) desc`)
    .all();

  const providerRows = await db
    .select({
      provider: sql<string>`json_extract(${auditLogs.metadata}, '$.provider')`,
      calls: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(coalesce(nullif(json_extract(${auditLogs.metadata}, '$.tokensIn'), ''), 0)), 0)`,
      tokensOut: sql<number>`coalesce(sum(coalesce(nullif(json_extract(${auditLogs.metadata}, '$.tokensOut'), ''), 0)), 0)`,
    })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.action, 'ai.request'),
      eq(auditLogs.resourceType, 'ai_request'),
      eq(sql`json_extract(${auditLogs.metadata}, '$.businessId')`, opts.businessId),
      gte(auditLogs.createdAt, opts.fromMs),
      lt(auditLogs.createdAt, opts.toMs),
    ))
    .groupBy(sql`json_extract(${auditLogs.metadata}, '$.provider')`)
    .orderBy(sql`count(*) desc`)
    .all();

  return {
    fromMs: opts.fromMs,
    toMs: opts.toMs,
    totals: {
      calls: Number(totalRow?.calls ?? 0),
      tokensIn: Number(totalRow?.tokensIn ?? 0),
      tokensOut: Number(totalRow?.tokensOut ?? 0),
      errors: Number(totalRow?.errors ?? 0),
    },
    byDay: dayRows.map((r) => ({
      day: r.day,
      calls: Number(r.calls),
      tokensIn: Number(r.tokensIn),
      tokensOut: Number(r.tokensOut),
      errors: Number(r.errors),
    })),
    byIntent: intentRows.map((r) => ({
      intent: r.intent,
      calls: Number(r.calls),
      tokensIn: Number(r.tokensIn),
      tokensOut: Number(r.tokensOut),
    })),
    byProvider: providerRows
      .filter((r) => r.provider != null)
      .map((r) => ({
        provider: String(r.provider),
        calls: Number(r.calls),
        tokensIn: Number(r.tokensIn),
        tokensOut: Number(r.tokensOut),
      })),
  };
}
