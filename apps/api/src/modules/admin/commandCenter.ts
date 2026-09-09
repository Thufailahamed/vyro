import { Hono } from 'hono';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { purchaseOrders, payouts } from '@vyro/db/schema';
import { eq, count } from 'drizzle-orm';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const openDisputes = await db
    .select({ n: count() })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.status, 'disputed'))
    .get();
  const payoutFailures = await db
    .select({ n: count() })
    .from(payouts)
    .where(eq(payouts.status, 'failed'))
    .get();
  return c.json({
    needsAction: {
      stuckPayments: 0,
      payoutFailures: payoutFailures?.n ?? 0,
      slaBreaches: 0,
      openDisputes: openDisputes?.n ?? 0,
    },
    recentEvents: [],
  });
});

export default router;
