import { getDb } from '@vyro/db';
import { sql, eq, and, gte } from 'drizzle-orm';
import {
  webhookDeliveries,
  abuseReports,
  kycReviews,
  refunds,
  adminAuditLogs,
} from '@vyro/db/schema';

export type HealthSnapshot = {
  dbLatencyMs: number;
  pendingWebhookDeliveries: number;
  failedWebhookDeliveries24h: number;
  openAbuseReports: number;
  pendingKyc: number;
  pendingRefunds: number;
  recentErrors: Array<{ action: string; createdAt: number; status: string | null }>;
  capturedAt: number;
};

export async function snapshot(d1: D1Database): Promise<HealthSnapshot> {
  const db = getDb(d1);
  const start = Date.now();
  await db.select({ x: sql<number>`1` }).from(adminAuditLogs).limit(1).all();
  const dbLatencyMs = Date.now() - start;

  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  const pendingWh = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.status, 'pending'))
    .get()) as { count: number };

  const failedWh = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, 'failed'), gte(webhookDeliveries.createdAt, since24h)))
    .get()) as { count: number };

  const openReports = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(abuseReports)
    .where(eq(abuseReports.status, 'open'))
    .get()) as { count: number };

  const pendingKyc = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(kycReviews)
    .where(eq(kycReviews.status, 'pending'))
    .get()) as { count: number };

  const pendingRefunds = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(refunds)
    .where(eq(refunds.status, 'requested'))
    .get()) as { count: number };

  const recentErrors = (await db
    .select({
      action: adminAuditLogs.action,
      createdAt: adminAuditLogs.createdAt,
      after: adminAuditLogs.after,
    })
    .from(adminAuditLogs)
    .where(gte(adminAuditLogs.createdAt, since24h))
    .orderBy(sql`${adminAuditLogs.createdAt} DESC`)
    .limit(50)
    .all()) as Array<{ action: string; createdAt: number; after: string | null }>;

  return {
    dbLatencyMs,
    pendingWebhookDeliveries: Number(pendingWh.count ?? 0),
    failedWebhookDeliveries24h: Number(failedWh.count ?? 0),
    openAbuseReports: Number(openReports.count ?? 0),
    pendingKyc: Number(pendingKyc.count ?? 0),
    pendingRefunds: Number(pendingRefunds.count ?? 0),
    recentErrors: recentErrors.map((r) => ({
      action: r.action,
      createdAt: r.createdAt,
      status: r.after,
    })),
    capturedAt: Date.now(),
  };
}
