import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, purchaseOrders, suppliers, products } from '@vyro/db/schema';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

interface TrustStats {
  districtsCovered: number;
  lifetimeGmvCents: number;
  activeBusinesses: number;
  activeSuppliers: number;
}

// 5-minute in-memory cache for the aggregate stats. The feed lists stay
// live; only the counts are cached to avoid aggregating per homepage hit.
const STATS_TTL_MS = 5 * 60 * 1000;
let statsCache: { at: number; stats: TrustStats } | null = null;

/** Test hook: clears the cached aggregates between test cases. */
export function __resetTrustStatsCache(): void {
  statsCache = null;
}

async function loadTrustStats(d1: D1Database): Promise<TrustStats> {
  const now = Date.now();
  if (statsCache && now - statsCache.at < STATS_TTL_MS) return statsCache.stats;
  const db = getDb(d1);
  const [supDistricts, bizDistricts, gmvRows, supCountRows, bizCountRows] = await Promise.all([
    db
      .select({ district: suppliers.district })
      .from(suppliers)
      .where(eq(suppliers.status, 'active'))
      .groupBy(suppliers.district)
      .all(),
    db
      .select({ district: businesses.district })
      .from(businesses)
      .where(eq(businesses.status, 'active'))
      .groupBy(businesses.district)
      .all(),
    db
      .select({ total: sql<number>`coalesce(sum(${purchaseOrders.totalCents}),0)` })
      .from(purchaseOrders)
      .where(sql`${purchaseOrders.status} not in ('cancelled','rejected')`)
      .all(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(suppliers)
      .where(eq(suppliers.status, 'active'))
      .all(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(businesses)
      .where(eq(businesses.status, 'active'))
      .all(),
  ]);
  const districts = new Set<string>([
    ...(supDistricts as Array<{ district: string }>).map((r) => r.district),
    ...(bizDistricts as Array<{ district: string }>).map((r) => r.district),
  ]);
  const stats: TrustStats = {
    districtsCovered: districts.size,
    lifetimeGmvCents: Number((gmvRows as Array<{ total: number }>)[0]?.total ?? 0),
    activeBusinesses: Number((bizCountRows as Array<{ n: number }>)[0]?.n ?? 0),
    activeSuppliers: Number((supCountRows as Array<{ n: number }>)[0]?.n ?? 0),
  };
  statsCache = { at: now, stats };
  return stats;
}

router.get('/feed', async (c) => {
  const db = getDb(c.env.DB);
  const featured = await db
    .select()
    .from(products)
    .orderBy(sql`${products.createdAt} desc`)
    .limit(8)
    .all();
  const verified = await db
    .select()
    .from(suppliers)
    .where(sql`${suppliers.status} = 'active'`)
    .limit(8)
    .all();
  const publicSuppliers = verified.map((s) => {
    const { contactPerson: _c, phone: _p, email: _e, address: _a, ...rest } = s;
    void _c; void _p; void _e; void _a;
    return rest;
  });
  return c.json({
    featuredProducts: featured,
    verifiedSuppliers: publicSuppliers,
    trustStats: await loadTrustStats(c.env.DB),
    journeySteps: [
      { title: 'Sign up', body: 'Create your free VYRO account in under a minute.' },
      { title: 'Browse', body: 'Discover verified suppliers across Sri Lanka.' },
      { title: 'Order', body: 'Compare offers, place POs, track in real-time.' },
    ],
    faq: [
      {
        q: 'How does VYRO verify suppliers?',
        a: 'We check business registration and trade references before activation.',
      },
      {
        q: 'What payment methods are supported?',
        a: 'Cash on delivery, bank transfer, and secure online payments via PayHere.',
      },
    ],
  });
});

export default router;
