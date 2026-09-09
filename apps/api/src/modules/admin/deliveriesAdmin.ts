import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { deliveries, purchaseOrders, businesses, suppliers } from '@vyro/db/schema';
import { eq, and, or, like, desc } from 'drizzle-orm';
import { adminListQuery, adminReasonBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/', async (c) => {
  const parsed = adminListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);

  const conditions = [];

  if (parsed.data.status && parsed.data.status !== 'all') {
    conditions.push(eq(deliveries.status, parsed.data.status as any));
  }

  if (parsed.data.q && parsed.data.q.trim()) {
    const qPattern = `%${parsed.data.q.trim()}%`;
    conditions.push(
      or(
        like(deliveries.id, qPattern),
        like(deliveries.driverName, qPattern),
        like(deliveries.driverPhone, qPattern),
        like(purchaseOrders.poNumber, qPattern),
        like(purchaseOrders.deliveryCity, qPattern),
        like(purchaseOrders.deliveryDistrict, qPattern),
        like(businesses.name, qPattern),
        like(suppliers.name, qPattern),
      ),
    );
  }

  const query = db
    .select({
      id: deliveries.id,
      purchaseOrderId: deliveries.purchaseOrderId,
      status: deliveries.status,
      driverName: deliveries.driverName,
      driverPhone: deliveries.driverPhone,
      estimatedAt: deliveries.estimatedAt,
      pickedUpAt: deliveries.pickedUpAt,
      deliveredAt: deliveries.deliveredAt,
      assignedByUserId: deliveries.assignedByUserId,
      createdAt: deliveries.createdAt,
      updatedAt: deliveries.updatedAt,
      poNumber: purchaseOrders.poNumber,
      orderStatus: purchaseOrders.status,
      deliveryAddress: purchaseOrders.deliveryAddress,
      deliveryCity: purchaseOrders.deliveryCity,
      deliveryDistrict: purchaseOrders.deliveryDistrict,
      totalCents: purchaseOrders.totalCents,
      currency: purchaseOrders.currency,
      businessId: purchaseOrders.businessId,
      businessName: businesses.name,
      businessPhone: businesses.phone,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
    })
    .from(deliveries)
    .leftJoin(purchaseOrders, eq(deliveries.purchaseOrderId, purchaseOrders.id))
    .leftJoin(businesses, eq(purchaseOrders.businessId, businesses.id))
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .orderBy(desc(deliveries.createdAt))
    .limit(parsed.data.limit ?? 50);

  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).all()
    : await query.all();

  return c.json({ deliveries: rows });
});

const reassignSchema = adminReasonBody.extend({
  assigneeId: z.string().min(1),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(50).optional(),
  estimatedAt: z.number().int().positive().optional(),
});

router.post('/:id/reassign', async (c) => {
  const parsed = reassignSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(deliveries).where(eq(deliveries.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Delivery not found');

  const patch: Record<string, unknown> = {
    assignedByUserId: parsed.data.assigneeId,
    updatedAt: Date.now(),
  };
  if (parsed.data.driverName) patch.driverName = parsed.data.driverName;
  if (parsed.data.driverPhone) patch.driverPhone = parsed.data.driverPhone;
  if (parsed.data.estimatedAt) patch.estimatedAt = parsed.data.estimatedAt;
  if (row.status === 'pending') patch.status = 'assigned';

  await db.update(deliveries).set(patch as any).where(eq(deliveries.id, row.id)).run();

  await auditAdmin({
    ctx: c,
    action: 'delivery.reassign',
    target: { type: 'delivery', id: row.id },
    before: {
      assignedByUserId: row.assignedByUserId,
      driverName: row.driverName,
      driverPhone: row.driverPhone,
      status: row.status,
    },
    after: parsed.data,
  });
  return c.json({ ok: true });
});

router.post('/:id/mark-lost', async (c) => {
  const parsed = adminReasonBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(deliveries).where(eq(deliveries.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Delivery not found');

  await db
    .update(deliveries)
    .set({ status: 'failed', updatedAt: Date.now() })
    .where(eq(deliveries.id, row.id))
    .run();

  await auditAdmin({
    ctx: c,
    action: 'delivery.mark-lost',
    target: { type: 'delivery', id: row.id },
    before: { status: row.status },
    after: parsed.data,
  });
  return c.json({ ok: true });
});

const updateStatusSchema = adminReasonBody.extend({
  status: z.enum(['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed']),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(50).optional(),
  estimatedAt: z.number().int().positive().optional(),
});

router.post('/:id/update-status', async (c) => {
  const parsed = updateStatusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(deliveries).where(eq(deliveries.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Delivery not found');

  const now = Date.now();
  const patch: Record<string, unknown> = {
    status: parsed.data.status,
    updatedAt: now,
  };
  if (parsed.data.driverName !== undefined) patch.driverName = parsed.data.driverName;
  if (parsed.data.driverPhone !== undefined) patch.driverPhone = parsed.data.driverPhone;
  if (parsed.data.estimatedAt !== undefined) patch.estimatedAt = parsed.data.estimatedAt;
  if (parsed.data.status === 'picked_up' && !row.pickedUpAt) patch.pickedUpAt = now;
  if (parsed.data.status === 'delivered' && !row.deliveredAt) patch.deliveredAt = now;

  await db.update(deliveries).set(patch as any).where(eq(deliveries.id, row.id)).run();

  await auditAdmin({
    ctx: c,
    action: 'delivery.update-status',
    target: { type: 'delivery', id: row.id },
    before: { status: row.status, driverName: row.driverName },
    after: parsed.data,
  });
  return c.json({ ok: true });
});

export default router;

