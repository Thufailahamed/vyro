import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders, users, suppliers } from '@vyro/db/schema';

export type AdminAnalyticsRange = '7d' | '30d' | '90d';

export type AdminAnalytics = {
  range: AdminAnalyticsRange;
  metrics: {
    gmvCents: number;
    takeRateCents: number;
    activeBuyers: number;
    activeSuppliers: number;
    newSignups: number;
    disputeRate: number;
    completionRate: number;
  };
  gmvByDay: Array<{ day: string; cents: number }>;
  topCategories: Array<{ categoryId: string; name: string; cents: number }>;
  topRegions: Array<{ district: string; cents: number }>;
};

function rangeStart(range: AdminAnalyticsRange): number {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return Date.now() - days * 86_400_000;
}

function dayBucket(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function computeAdminAnalytics(
  d1: D1Database,
  range: AdminAnalyticsRange,
  platformFeeBps: number,
): Promise<AdminAnalytics> {
  const start = rangeStart(range);
  const db = getDb(d1);

  const pos = await db
    .select({
      total: purchaseOrders.totalCents,
      status: purchaseOrders.status,
      createdAt: purchaseOrders.createdAt,
      businessId: purchaseOrders.businessId,
      supplierId: purchaseOrders.supplierId,
    })
    .from(purchaseOrders)
    .where(gte(purchaseOrders.createdAt, start))
    .all();

  const live = pos.filter((p) => p.status !== 'cancelled');
  const gmvCents = live.reduce((s, p) => s + (p.total ?? 0), 0);
  const takeRateCents = Math.floor((gmvCents * platformFeeBps) / 10000);
  const activeBuyers = new Set(live.map((p) => p.businessId)).size;
  const activeSuppliers = new Set(live.map((p) => p.supplierId)).size;

  const totalPos = pos.length;
  const disputed = pos.filter((p) => p.status === 'disputed').length;
  const completed = live.filter((p) => p.status === 'completed').length;
  const disputeRate = totalPos === 0 ? 0 : disputed / totalPos;
  const completionRate = live.length === 0 ? 0 : completed / live.length;

  void suppliers;
  void and;
  void eq;

  const newSignups = (
    await db.select({ id: users.id }).from(users).where(gte(users.createdAt, start)).all()
  ).length;

  const dayMap = new Map<string, number>();
  for (const p of live) {
    const key = dayBucket(p.createdAt);
    dayMap.set(key, (dayMap.get(key) ?? 0) + (p.total ?? 0));
  }
  const gmvByDay = [...dayMap.entries()].map(([day, cents]) => ({ day, cents }));

  return {
    range,
    metrics: {
      gmvCents,
      takeRateCents,
      activeBuyers,
      activeSuppliers,
      newSignups,
      disputeRate,
      completionRate,
    },
    gmvByDay,
    topCategories: [],
    topRegions: [],
  };
}
