import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requireRole, requirePermission } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { suppliers, businesses, auditLogs, purchaseOrders } from '@vyro/db/schema';
import { and, eq, like, lt, sql, type SQL } from 'drizzle-orm';
import {
  findSupplierById,
  setSupplierStatus,
  setSupplierVerification,
} from '../suppliers/repository';
import { notifySupplierOrg } from '../notifications/dispatcher';
import { auditAdmin } from './lib/audit';
import { dispatch as dispatchWebhook } from '../../lib/webhooks';
import { queuesRoutes } from './queues/queuesRoutes';

const router = new Hono<{ Bindings: Env }>();

const idParam = z.object({ id: z.string().min(1) }).strict();
const freezeSchema = z.object({ reason: z.string().max(500) }).strict();
const verificationSchema = z
  .object({
    // 'suspended' is reachable via freeze/unfreeze; verification review only
    // ever decides verified vs rejected, or sends a record back to pending.
    status: z.enum(['verified', 'rejected', 'pending']),
    reason: z.string().max(500).optional(),
    /** Optimistic-concurrency guard: the status the reviewer saw in the UI. */
    expectStatus: z.enum(['pending', 'verified', 'rejected', 'suspended']).optional(),
  })
  .strict()
  .refine((v) => v.status !== 'rejected' || (v.reason && v.reason.trim().length >= 5), {
    message: 'A reason of at least 5 characters is required when rejecting',
    path: ['reason'],
  });
const listQuery = z.object({
  q: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  cursor: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const DEFAULT_LIMIT = 50;

router.use('*', session(), requireRole({ admin: true }));

router.route('/queues', queuesRoutes);

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

  // Mirror into the admin audit trail that /admin/activity reads.
  await auditAdmin({
    ctx: c,
    action: 'supplier.freeze',
    target: { type: 'supplier', id: sup.id },
    after: { reason: parsed.data.reason },
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

  // Mirror into the admin audit trail that /admin/activity reads.
  await auditAdmin({
    ctx: c,
    action: 'supplier.unfreeze',
    target: { type: 'supplier', id: sup.id },
  });

  return c.json({ ok: true, status: 'active' });
});

router.post(
  '/suppliers/:id/verification',
  requireRole({ permission: 'supplier:verify' }),
  async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const idParsed = idParam.safeParse(c.req.param());
  if (!idParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');

  const parsed = verificationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const sup = await findSupplierById(c.env.DB, idParsed.data.id);
  if (!sup) throw httpError(404, 'NOT_FOUND', 'Supplier not found');

  const before = { verificationStatus: sup.verificationStatus };
  const ok = await setSupplierVerification(
    c.env.DB,
    sup.id,
    parsed.data.status,
    parsed.data.expectStatus,
  );
  if (!ok) {
    // Either the supplier vanished or someone else reviewed them first.
    throw httpError(409, 'CONFLICT', 'Supplier verification status changed; refresh and retry');
  }

  const db = getDb(c.env.DB);
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'supplier.verify',
    resourceType: 'supplier',
    resourceId: sup.id,
    metadata: JSON.stringify({
      before: before.verificationStatus,
      after: parsed.data.status,
      reason: parsed.data.reason ?? null,
    }),
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: Date.now(),
  });

  await auditAdmin({
    ctx: c,
    action: 'supplier.verify',
    target: { type: 'supplier', id: sup.id },
    before,
    after: { verificationStatus: parsed.data.status, reason: parsed.data.reason ?? null },
  });

  // Tell every owner/manager of the supplier org — the existing pattern used by
  // freeze/unfreeze. Fire-and-forget: the API contract is the 200, not the message.
  c.executionCtx?.waitUntil?.(
    notifySupplierOrg(c.env.DB, c.env.NOTIFICATIONS_QUEUE, sup.id, {
      type: parsed.data.status === 'verified'
        ? 'supplier.verified'
        : parsed.data.status === 'rejected'
          ? 'supplier.rejected'
          : 'supplier.review_required',
      title:
        parsed.data.status === 'verified'
          ? 'You are verified on Vyro'
          : parsed.data.status === 'rejected'
            ? 'Verification was rejected'
            : 'More information needed',
      body: parsed.data.reason ?? null,
      link: `/supplier/verification`,
    }),
  );

  // Outbound webhooks for subscribers who care about KYB decisions.
  c.executionCtx?.waitUntil?.(
    dispatchWebhook(c.env, {
      eventType: parsed.data.status === 'verified'
        ? 'supplier.verified'
        : parsed.data.status === 'rejected'
          ? 'supplier.rejected'
          : 'supplier.review_required',
      payload: {
        supplierId: sup.id,
        supplierName: sup.name,
        decision: parsed.data.status,
        reason: parsed.data.reason ?? null,
        decidedBy: ctx.userId,
        decidedAt: Date.now(),
      },
    }),
  );

  return c.json({ ok: true, status: parsed.data.status });
  },
);

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

  // Mirror into the admin audit trail that /admin/activity reads.
  await auditAdmin({
    ctx: c,
    action: 'business.freeze',
    target: { type: 'business', id: biz.id },
    after: { reason: parsed.data.reason },
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

  // Mirror into the admin audit trail that /admin/activity reads.
  await auditAdmin({
    ctx: c,
    action: 'business.unfreeze',
    target: { type: 'business', id: biz.id },
  });

  return c.json({ ok: true, status: 'active' });
});

router.get('/disputed', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.status, 'disputed')).all();
  return c.json({ orders: rows });
});

export default router;
