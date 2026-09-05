import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { suppliers, businesses, auditLogs, purchaseOrders, users } from '@vyro/db/schema';
import { and, eq, like, lt, sql, type SQL } from 'drizzle-orm';
import { findSupplierById, setSupplierStatus } from '../suppliers/repository';

const router = new Hono<{ Bindings: Env }>();

const idParam = z.object({ id: z.string().min(1) }).strict();
const freezeSchema = z.object({ reason: z.string().max(500) }).strict();
const listQuery = z.object({
  q: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  cursor: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const auditQuery = z.object({
  action: z.string().max(100).optional(),
  resourceType: z.string().max(50).optional(),
  actorUserId: z.string().max(64).optional(),
  since: z.coerce.number().int().optional(),
  until: z.coerce.number().int().optional(),
  cursor: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const DEFAULT_LIMIT = 50;

router.use('*', session(), requireRole({ admin: true }));

router.get('/suppliers', async (c) => {
  const parsed = listQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const { q, status, cursor } = parsed.data;
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const db = getDb(c.env.DB);
  const conds: SQL[] = [];
  if (q) conds.push(like(suppliers.name, `%${q}%`));
  if (status) conds.push(eq(suppliers.status, status as 'active' | 'suspended'));
  if (cursor) conds.push(lt(suppliers.createdAt, Number(cursor)));
  const rows = await db
    .select()
    .from(suppliers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${suppliers.createdAt} desc`)
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return c.json({
    suppliers: page,
    nextCursor: hasMore && last ? String(last.createdAt) : undefined,
  });
});

router.get('/businesses', async (c) => {
  const parsed = listQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const { q, status, cursor } = parsed.data;
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const db = getDb(c.env.DB);
  const conds: SQL[] = [];
  if (q) conds.push(like(businesses.name, `%${q}%`));
  if (status) conds.push(eq(businesses.status, status as 'active' | 'suspended'));
  if (cursor) conds.push(lt(businesses.createdAt, Number(cursor)));
  const rows = await db
    .select()
    .from(businesses)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${businesses.createdAt} desc`)
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return c.json({
    businesses: page,
    nextCursor: hasMore && last ? String(last.createdAt) : undefined,
  });
});

router.get('/audit', async (c) => {
  const parsed = auditQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const { action, resourceType, actorUserId, since, until, cursor } = parsed.data;
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const db = getDb(c.env.DB);
  const conds: SQL[] = [];
  if (action) conds.push(eq(auditLogs.action, action));
  if (resourceType) conds.push(eq(auditLogs.resourceType, resourceType));
  if (actorUserId) conds.push(eq(auditLogs.actorUserId, actorUserId));
  if (since != null) conds.push(sql`${auditLogs.createdAt} >= ${since}`);
  if (until != null) conds.push(sql`${auditLogs.createdAt} <= ${until}`);
  if (cursor) conds.push(lt(auditLogs.createdAt, Number(cursor)));
  const rows = await db
    .select({
      id: auditLogs.id,
      actorUserId: auditLogs.actorUserId,
      actorEmail: users.email,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      metadata: auditLogs.metadata,
      ip: auditLogs.ip,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${auditLogs.createdAt} desc`)
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return c.json({
    logs: page,
    nextCursor: hasMore && last ? String(last.createdAt) : undefined,
  });
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

router.post('/businesses/:id/freeze', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const idParsed = idParam.safeParse(c.req.param());
  if (!idParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const parsed = freezeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const db = getDb(c.env.DB);
  const biz = await db.select().from(businesses).where(eq(businesses.id, idParsed.data.id)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  await db.update(businesses).set({ status: 'suspended' }).where(eq(businesses.id, biz.id)).run();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'business.freeze',
    resourceType: 'business',
    resourceId: biz.id,
    metadata: JSON.stringify({ reason: parsed.data.reason }),
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: Date.now(),
  });

  return c.json({ ok: true, status: 'suspended' });
});

router.post('/businesses/:id/unfreeze', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const idParsed = idParam.safeParse(c.req.param());
  if (!idParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');

  const db = getDb(c.env.DB);
  const biz = await db.select().from(businesses).where(eq(businesses.id, idParsed.data.id)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  await db.update(businesses).set({ status: 'active' }).where(eq(businesses.id, biz.id)).run();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'business.unfreeze',
    resourceType: 'business',
    resourceId: biz.id,
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
