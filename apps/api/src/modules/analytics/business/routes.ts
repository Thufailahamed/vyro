import { Hono } from 'hono';
import { eq, ne, and, sql } from 'drizzle-orm';
import { session } from '../../../middleware/session';
import { requireRole } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import type { Env } from '../../../env';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ business: ['owner', 'manager', 'purchasing', 'accountant'] }));

router.get('/monthly-spend', async (c) => {
  const ctx = c.get('ctx') as { userId: string; businesses: Array<{ businessId?: string }> } | undefined;
  if (!ctx?.businesses?.length) throw httpError(403, 'FORBIDDEN', 'No business membership');
  const requested = c.req.query('businessId');
  if (requested && !ctx.businesses.find((b) => b.businessId === requested)?.businessId) {
    throw httpError(403, 'FORBIDDEN', 'No access to requested business');
  }
  const businessId = requested ?? ctx.businesses[0]!.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business');
  const months = Math.min(Math.max(Number(c.req.query('months') ?? 12), 1), 24);
  const since = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      createdAt: purchaseOrders.createdAt,
      totalCents: purchaseOrders.totalCents,
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.businessId, businessId),
        ne(purchaseOrders.status, 'cancelled'),
        sql`${purchaseOrders.createdAt} >= ${since}`
      )
    )
    .all();
  const buckets = Array.from({ length: months }, (_, i) => {
    const start = new Date(Date.now() - (months - 1 - i) * 30 * 24 * 60 * 60 * 1000);
    const month = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month, totalCents: 0 };
  });
  for (const r of rows) {
    const d = new Date(r.createdAt as number);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const b = buckets.find((x) => x.month === key);
    if (b) b.totalCents += r.totalCents as number;
  }
  return c.json({ buckets });
});

export default router;
