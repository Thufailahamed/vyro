import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  orderReturnAttachments,
  orderReturnItems,
  orderReturns,
  purchaseOrderItems,
  purchaseOrders,
  type OrderReturn,
  type OrderReturnItem,
} from '@vyro/db/schema';

export type ReturnWithItems = OrderReturn & {
  items: Array<OrderReturnItem & { productName: string | null }>;
  attachments: Array<{ id: string; contentType: string | null; createdAt: number }>;
};

export async function findReturn(d1: D1Database, id: string): Promise<OrderReturn | null> {
  return ((await getDb(d1).select().from(orderReturns).where(eq(orderReturns.id, id)).get()) as OrderReturn | undefined) ?? null;
}

export async function loadReturnItems(d1: D1Database, returnIds: string[]) {
  if (returnIds.length === 0) return [];
  const db = getDb(d1);
  const items = await db.select().from(orderReturnItems).where(inArray(orderReturnItems.returnId, returnIds)).all();
  const poiIds = [...new Set(items.map((i) => i.purchaseOrderItemId))];
  const names = poiIds.length
    ? await db
        .select({ id: purchaseOrderItems.id, name: purchaseOrderItems.productNameSnapshot })
        .from(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.id, poiIds))
        .all()
    : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  return items.map((i) => ({ ...i, productName: nameById.get(i.purchaseOrderItemId) ?? null }));
}

async function hydrate(d1: D1Database, rows: OrderReturn[]): Promise<ReturnWithItems[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const items = await loadReturnItems(d1, ids);
  const atts = await getDb(d1)
    .select({
      id: orderReturnAttachments.id,
      returnId: orderReturnAttachments.returnId,
      contentType: orderReturnAttachments.contentType,
      createdAt: orderReturnAttachments.createdAt,
    })
    .from(orderReturnAttachments)
    .where(inArray(orderReturnAttachments.returnId, ids))
    .all();
  return rows.map((r) => ({
    ...r,
    items: items.filter((i) => i.returnId === r.id),
    attachments: atts.filter((a) => a.returnId === r.id).map(({ returnId: _r, ...a }) => a),
  }));
}

export async function getReturnWithItems(d1: D1Database, id: string): Promise<ReturnWithItems | null> {
  const r = await findReturn(d1, id);
  if (!r) return null;
  return (await hydrate(d1, [r]))[0] ?? null;
}

export async function listReturnsForPo(d1: D1Database, poId: string): Promise<ReturnWithItems[]> {
  const rows = (await getDb(d1)
    .select()
    .from(orderReturns)
    .where(eq(orderReturns.purchaseOrderId, poId))
    .orderBy(desc(orderReturns.createdAt))
    .all()) as OrderReturn[];
  return hydrate(d1, rows);
}

export async function listReturns(
  d1: D1Database,
  filter: { businessId?: string; supplierId?: string; statuses?: string[]; limit?: number },
): Promise<Array<ReturnWithItems & { poNumber: string | null }>> {
  const db = getDb(d1);
  const conds: SQL[] = [];
  if (filter.businessId) conds.push(eq(orderReturns.businessId, filter.businessId));
  if (filter.supplierId) conds.push(eq(orderReturns.supplierId, filter.supplierId));
  if (filter.statuses?.length) conds.push(inArray(orderReturns.status, filter.statuses as never[]));
  const rows = (await db
    .select()
    .from(orderReturns)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orderReturns.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500))
    .all()) as OrderReturn[];
  const hydrated = await hydrate(d1, rows);
  const poIds = [...new Set(rows.map((r) => r.purchaseOrderId))];
  const pos = poIds.length
    ? await db
        .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber })
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.id, poIds))
        .all()
    : [];
  const num = new Map(pos.map((p) => [p.id, p.poNumber]));
  return hydrated.map((r) => ({ ...r, poNumber: num.get(r.purchaseOrderId) ?? null }));
}
