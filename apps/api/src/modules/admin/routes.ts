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
import { findSupplierById, setSupplierStatus } from '../suppliers/repository';

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

  const sup = await findSupplierById(c.env.DB, idParsed.data.id);
  if (!sup) throw httpError(404, 'NOT_FOUND', 'Supplier not found');

  await setSupplierStatus(c.env.DB, sup.id, 'suspended');

  const db = getDb(c.env.DB);
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

  return c.json({ ok: true, status: 'suspended' });
});

router.post('/suppliers/:id/unfreeze', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const idParsed = idParam.safeParse(c.req.param());
  if (!idParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');

  const sup = await findSupplierById(c.env.DB, idParsed.data.id);
  if (!sup) throw httpError(404, 'NOT_FOUND', 'Supplier not found');

  await setSupplierStatus(c.env.DB, sup.id, 'active');

  const db = getDb(c.env.DB);
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'supplier.unfreeze',
    resourceType: 'supplier',
    resourceId: sup.id,
    metadata: null,
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: Date.now(),
  });

  return c.json({ ok: true, status: 'active' });
});

router.get('/disputed', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.status, 'disputed')).all();
  return c.json({ orders: rows });
});

export default router;
