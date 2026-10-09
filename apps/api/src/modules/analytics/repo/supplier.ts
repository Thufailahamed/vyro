import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  purchaseOrders,
  purchaseOrderItems,
  supplierProducts,
  supplierMembers,
  orderReturns,
  orderReturnItems,
} from '@vyro/db/schema';

export type AnalyticsRange = '7d' | '30d' | '90d';

export type SupplierAnalytics = {
  range: AnalyticsRange;
  metrics: {
    /** Net revenue: booked order value minus goods taken back through settled returns. */
    revenueCents: number;
    grossRevenueCents: number;
    returnsCents: number;
    returnedOrdersCount: number;
    ordersCount: number;
    avgOrderValueCents: number;
    repeatCustomerRate: number;
    lowStockCount: number;
    avgLeadTimeDays: number;
  };
  revenueTrend: Array<{ day: string; cents: number }>;
  ordersByDay: Array<{ day: string; count: number }>;
  topProducts: Array<{ productId: string; name: string; revenueCents: number; units: number }>;
};

function rangeStart(range: AnalyticsRange): number {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return Date.now() - days * 86_400_000;
}

function dayBucket(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function ensureSupplierMember(
  d1: D1Database,
  supplierId: string,
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  if (isAdmin) return;
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (!m || !['owner', 'manager', 'sales'].includes(m.role)) {
    throw new Error('FORBIDDEN');
  }
}

export async function computeSupplierAnalytics(
  d1: D1Database,
  supplierId: string,
  range: AnalyticsRange,
): Promise<SupplierAnalytics> {
  const start = rangeStart(range);
  const db = getDb(d1);

  const poRows = await db
    .select({
      id: purchaseOrders.id,
      total: purchaseOrders.totalCents,
      created: purchaseOrders.createdAt,
      businessId: purchaseOrders.businessId,
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        gte(purchaseOrders.createdAt, start),
        sql`${purchaseOrders.status} NOT IN ('cancelled', 'rejected')`,
      ),
    )
    .all();

  // Settled returns (refund issued) reverse revenue on the order's booking day.
  const poIds = poRows.map((r) => r.id);
  const returnRows: Array<{ id: string; poId: string; refund: number }> = [];
  for (let i = 0; i < poIds.length; i += 90) {
    returnRows.push(
      ...(await db
        .select({ id: orderReturns.id, poId: orderReturns.purchaseOrderId, refund: orderReturns.refundCents })
        .from(orderReturns)
        .where(and(inArray(orderReturns.purchaseOrderId, poIds.slice(i, i + 90)), inArray(orderReturns.status, ['refunded', 'closed'])))
        .all()),
    );
  }
  const returnedByPo = new Map<string, number>();
  for (const r of returnRows) returnedByPo.set(r.poId, (returnedByPo.get(r.poId) ?? 0) + (r.refund ?? 0));
  const returnLines: Array<{ poItemId: string; qty: number; cents: number }> = [];
  const retIds = returnRows.map((r) => r.id);
  for (let i = 0; i < retIds.length; i += 90) {
    const rows = await db
      .select({
        poItemId: orderReturnItems.purchaseOrderItemId,
        qty: orderReturnItems.receivedQuantity,
        approved: orderReturnItems.approvedQuantity,
        requested: orderReturnItems.quantity,
        unit: orderReturnItems.unitRefundCents,
      })
      .from(orderReturnItems)
      .where(inArray(orderReturnItems.returnId, retIds.slice(i, i + 90)))
      .all();
    for (const r of rows) {
      const q = r.qty ?? r.approved ?? r.requested;
      returnLines.push({ poItemId: r.poItemId, qty: q, cents: q * r.unit });
    }
  }

  const grossRevenueCents = poRows.reduce((s, r) => s + (r.total ?? 0), 0);
  const returnsCents = [...returnedByPo.values()].reduce((s, n) => s + n, 0);
  const revenueCents = Math.max(0, grossRevenueCents - returnsCents);
  const ordersCount = poRows.length;
  const avgOrderValueCents = ordersCount === 0 ? 0 : Math.floor(revenueCents / ordersCount);

  const distinctBiz = new Map<string, number>();
  for (const r of poRows) {
    distinctBiz.set(r.businessId, (distinctBiz.get(r.businessId) ?? 0) + 1);
  }
  const totalCustomers = distinctBiz.size;
  const repeatCustomers = [...distinctBiz.values()].filter((c) => c >= 2).length;
  const repeatCustomerRate = totalCustomers === 0 ? 0 : repeatCustomers / totalCustomers;

  const dayMap = new Map<string, { cents: number; count: number }>();
  for (const r of poRows) {
    const d = dayBucket(r.created);
    const cur = dayMap.get(d) ?? { cents: 0, count: 0 };
    cur.cents += Math.max(0, (r.total ?? 0) - (returnedByPo.get(r.id) ?? 0));
    cur.count += 1;
    dayMap.set(d, cur);
  }
  const revenueTrend = [...dayMap.entries()].map(([day, v]) => ({ day, cents: v.cents }));
  const ordersByDay = [...dayMap.entries()].map(([day, v]) => ({ day, count: v.count }));

  const sp = await db
    .select({ status: supplierProducts.availabilityStatus, lead: supplierProducts.leadTimeDays })
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierId, supplierId))
    .all();
  const lowStockCount = sp.filter((p) => p.status === 'low' || p.status === 'out_of_stock').length;
  const leadTimes = sp.filter((p) => typeof p.lead === 'number').map((p) => p.lead as number);
  const avgLeadTimeDays =
    leadTimes.length === 0 ? 0 : Math.round((leadTimes.reduce((s, n) => s + n, 0) / leadTimes.length) * 100) / 100;

  const items = await db
    .select({
      id: purchaseOrderItems.id,
      productId: purchaseOrderItems.supplierProductId,
      productNameSnapshot: purchaseOrderItems.productNameSnapshot,
      qty: purchaseOrderItems.quantity,
      total: purchaseOrderItems.lineTotalCents,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        gte(purchaseOrders.createdAt, start),
        sql`${purchaseOrders.status} NOT IN ('cancelled', 'rejected')`,
      ),
    )
    .all();

  const returnedByLine = new Map<string, { qty: number; cents: number }>();
  for (const l of returnLines) {
    const cur = returnedByLine.get(l.poItemId) ?? { qty: 0, cents: 0 };
    cur.qty += l.qty;
    cur.cents += l.cents;
    returnedByLine.set(l.poItemId, cur);
  }
  const byProduct = new Map<string, { name: string; cents: number; units: number }>();
  for (const it of items) {
    const back = returnedByLine.get(it.id);
    const cur = byProduct.get(it.productId) ?? { name: it.productNameSnapshot, cents: 0, units: 0 };
    cur.cents += Math.max(0, (it.total ?? 0) - (back?.cents ?? 0));
    cur.units += Math.max(0, (it.qty ?? 0) - (back?.qty ?? 0));
    byProduct.set(it.productId, cur);
  }
  const topProducts = [...byProduct.entries()]
    .map(([productId, v]) => ({
      productId,
      name: v.name,
      revenueCents: v.cents,
      units: v.units,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .filter((p) => p.units > 0 || p.revenueCents > 0)
    .slice(0, 10);

  return {
    range,
    metrics: {
      revenueCents,
      grossRevenueCents,
      returnsCents,
      returnedOrdersCount: returnedByPo.size,
      ordersCount,
      avgOrderValueCents,
      repeatCustomerRate,
      lowStockCount,
      avgLeadTimeDays,
    },
    revenueTrend,
    ordersByDay,
    topProducts,
  };
}
