import { Hono } from 'hono';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { purchaseOrders, businesses, suppliers, purchaseOrderItems, orderEvents } from '@vyro/db/schema';
import { eq, and, or, like, desc } from 'drizzle-orm';
import { adminListQuery, adminOrderOverrideBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/', async (c) => {
  const parsed = adminListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);

  const conditions = [];

  if (parsed.data.status && parsed.data.status !== 'all') {
    conditions.push(eq(purchaseOrders.status, parsed.data.status));
  }

  if (parsed.data.q && parsed.data.q.trim()) {
    const qPattern = `%${parsed.data.q.trim()}%`;
    conditions.push(
      or(
        like(purchaseOrders.poNumber, qPattern),
        like(purchaseOrders.id, qPattern),
        like(purchaseOrders.deliveryCity, qPattern),
        like(businesses.name, qPattern),
        like(suppliers.name, qPattern),
      ),
    );
  }

  const query = db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      businessId: purchaseOrders.businessId,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
      subtotalCents: purchaseOrders.subtotalCents,
      deliveryFeeCents: purchaseOrders.deliveryFeeCents,
      totalCents: purchaseOrders.totalCents,
      currency: purchaseOrders.currency,
      deliveryAddress: purchaseOrders.deliveryAddress,
      deliveryCity: purchaseOrders.deliveryCity,
      deliveryDistrict: purchaseOrders.deliveryDistrict,
      notes: purchaseOrders.notes,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      businessName: businesses.name,
      businessCity: businesses.city,
      supplierName: suppliers.name,
      supplierCity: suppliers.city,
    })
    .from(purchaseOrders)
    .leftJoin(businesses, eq(purchaseOrders.businessId, businesses.id))
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(parsed.data.limit ?? 50);

  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).all()
    : await query.all();

  return c.json({ orders: rows, nextCursor: null });
});

router.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const row = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      businessId: purchaseOrders.businessId,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
      subtotalCents: purchaseOrders.subtotalCents,
      deliveryFeeCents: purchaseOrders.deliveryFeeCents,
      totalCents: purchaseOrders.totalCents,
      currency: purchaseOrders.currency,
      deliveryAddress: purchaseOrders.deliveryAddress,
      deliveryCity: purchaseOrders.deliveryCity,
      deliveryDistrict: purchaseOrders.deliveryDistrict,
      notes: purchaseOrders.notes,
      rejectionReason: purchaseOrders.rejectionReason,
      cancelledReason: purchaseOrders.cancelledReason,
      createdByUserId: purchaseOrders.createdByUserId,
      acceptedAt: purchaseOrders.acceptedAt,
      rejectedAt: purchaseOrders.rejectedAt,
      preparedAt: purchaseOrders.preparedAt,
      readyAt: purchaseOrders.readyAt,
      dispatchedAt: purchaseOrders.dispatchedAt,
      deliveredAt: purchaseOrders.deliveredAt,
      completedAt: purchaseOrders.completedAt,
      cancelledAt: purchaseOrders.cancelledAt,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      businessName: businesses.name,
      businessContactPerson: businesses.contactPerson,
      businessPhone: businesses.phone,
      businessEmail: businesses.email,
      businessAddress: businesses.address,
      supplierName: suppliers.name,
      supplierContactPerson: suppliers.contactPerson,
      supplierPhone: suppliers.phone,
      supplierEmail: suppliers.email,
      supplierAddress: suppliers.address,
    })
    .from(purchaseOrders)
    .leftJoin(businesses, eq(purchaseOrders.businessId, businesses.id))
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.id, id))
    .get();

  if (!row) throw httpError(404, 'NOT_FOUND', 'Order not found');

  const items = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, id))
    .all();

  const events = await db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.purchaseOrderId, id))
    .orderBy(desc(orderEvents.createdAt))
    .all();

  return c.json({ order: row, items, events });
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
    .set({ status: parsed.data.status as any, updatedAt: Date.now() })
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

