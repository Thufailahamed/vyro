import { Hono } from 'hono';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { adminListQuery, adminOrderOverrideBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/', async (c) => {
  const parsed = adminListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(purchaseOrders)
    .limit(parsed.data.limit ?? 50)
    .all();
  return c.json({ orders: rows, nextCursor: null });
});

router.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const row = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Order not found');
  return c.json({ order: row });
});

router.post('/:id/override', async (c) => {
  const parsed = adminOrderOverrideBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Order not found');
  if (parsed.data.expectedUpdatedAt !== undefined && (row as any).updatedAt !== parsed.data.expectedUpdatedAt) {
    throw httpError(409, 'CONFLICT', 'Order changed; refresh and retry');
  }
  await db
    .update(purchaseOrders)
    .set({ status: parsed.data.status as any })
    .where(eq(purchaseOrders.id, row.id))
    .run();
  await auditAdmin({
    ctx: c,
    action: 'order.override',
    target: { type: 'purchase_order', id: row.id },
    before: { status: (row as any).status },
    after: { status: parsed.data.status, reason: parsed.data.reason },
  });
  return c.json({ ok: true, status: parsed.data.status });
});

export default router;
