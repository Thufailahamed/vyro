import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { getDb } from '@vyro/db';
import {
  users,
  businesses,
  suppliers,
  businessMembers,
  supplierMembers,
  purchaseOrders,
  payments,
  notifications,
} from '@vyro/db/schema';
import { eq, or, inArray } from 'drizzle-orm';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/me/export', async (c) => {
  const ctx = c.get('ctx') as { userId: string };
  const db = getDb(c.env.DB);

  const userRows = await db.select().from(users).where(eq(users.id, ctx.userId)).all();

  const bizMemberRows = await db
    .select({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(eq(businessMembers.userId, ctx.userId))
    .all();
  const businessIds = bizMemberRows.map((r) => r.businessId);

  const supMemberRows = await db
    .select({ supplierId: supplierMembers.supplierId })
    .from(supplierMembers)
    .where(eq(supplierMembers.userId, ctx.userId))
    .all();
  const supplierIds = supMemberRows.map((r) => r.supplierId);

  const businessRows = businessIds.length
    ? await db.select().from(businesses).where(inArray(businesses.id, businessIds)).all()
    : [];

  const supplierRows = supplierIds.length
    ? await db.select().from(suppliers).where(inArray(suppliers.id, supplierIds)).all()
    : [];

  let orderRows: unknown[] = [];
  if (businessIds.length || supplierIds.length) {
    const whereClause =
      businessIds.length && supplierIds.length
        ? or(inArray(purchaseOrders.businessId, businessIds), inArray(purchaseOrders.supplierId, supplierIds))
        : businessIds.length
          ? inArray(purchaseOrders.businessId, businessIds)
          : inArray(purchaseOrders.supplierId, supplierIds);
    orderRows = await db.select().from(purchaseOrders).where(whereClause!).all();
  }

  let paymentRows: unknown[] = [];
  if (orderRows.length) {
    const orderIdSet = (orderRows as Array<{ id: string }>).map((o) => o.id);
    paymentRows = await db
      .select()
      .from(payments)
      .where(inArray(payments.purchaseOrderId, orderIdSet))
      .all();
  }

  const notificationRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, ctx.userId))
    .all();

  return c.json({
    user: userRows[0] ?? null,
    businesses: businessRows,
    suppliers: supplierRows,
    orders: orderRows,
    payments: paymentRows,
    notifications: notificationRows,
    exportedAt: new Date().toISOString(),
  });
});

export default router;
