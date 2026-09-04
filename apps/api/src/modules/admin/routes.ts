import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { suppliers, businesses, auditLogs, purchaseOrders } from '@vyro/db/schema';
import { eq, sql } from 'drizzle-orm';

const router = new Hono<{ Bindings: Env }>();

const idParam = z.object({ id: z.string().min(1) }).strict();
const freezeSchema = z.object({ reason: z.string().max(500) }).strict();

router.use('*', session(), requireRole({ admin: true }));

router.get('/suppliers', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(suppliers).all();
  return c.json({ suppliers: rows });
});

router.get('/businesses', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(businesses).all();
  return c.json({ businesses: rows });
});

router.get('/audit', async (c) => {
  const db = getDb(c.env.DB);
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 500);
  const rows = await db.select().from(auditLogs).orderBy(sql`${auditLogs.createdAt} desc`).limit(limit).all();
  return c.json({ logs: rows });
});

router.post('/suppliers/:id/freeze', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const idParsed = idParam.safeParse(c.req.param());
  if (!idParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const parsed = freezeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const db = getDb(c.env.DB);
  const sup = await db.select().from(suppliers).where(eq(suppliers.id, idParsed.data.id)).get();
  if (!sup) throw httpError(404, 'NOT_FOUND', 'Supplier not found');

  // Soft "freeze" = mark with reason in audit; future schema field can be added.
  await db.update(suppliers).set({ updatedAt: Date.now() }).where(eq(suppliers.id, sup.id));

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'supplier.freeze',
    resourceType: 'supplier',
    resourceId: sup.id,
    metadata: JSON.stringify({ reason: parsed.data.reason }),
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: Date.now(),
  });

  return c.json({ ok: true });
});

router.get('/disputed', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.status, 'disputed')).all();
  return c.json({ orders: rows });
});

export default router;
