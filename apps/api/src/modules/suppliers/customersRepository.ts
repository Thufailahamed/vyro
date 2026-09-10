import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, purchaseOrders, supplierMembers } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';

export type CustomerSummary = {
  businessId: string;
  name: string;
  totalOrders: number;
  totalCents: number;
  lastOrderAt: number;
};

export async function ensureSupplierMember(
  d1: D1Database,
  supplierId: string,
  userId: string,
): Promise<void> {
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (!m || !['owner', 'manager', 'sales'].includes(m.role)) {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
}

function decodeCustomerCursor(cursor: string): { lastOrderAt: number; businessId: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const idx = raw.indexOf(':');
    if (idx === -1) return null;
    const ts = Number(raw.slice(0, idx));
    const businessId = raw.slice(idx + 1);
    if (!Number.isFinite(ts) || !businessId) return null;
    return { lastOrderAt: ts, businessId };
  } catch {
    return null;
  }
}

function encodeCustomerCursor(lastOrderAt: number, businessId: string): string {
  return Buffer.from(`${lastOrderAt}:${businessId}`, 'utf8').toString('base64url');
}

export async function listCustomersForSupplier(
  d1: D1Database,
  supplierId: string,
  opts?: { cursor?: string | null; limit?: number },
): Promise<{ items: CustomerSummary[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
  const cursor = opts?.cursor ? decodeCustomerCursor(opts.cursor) : null;
  const db = getDb(d1);
  const base = db
    .select({
      businessId: purchaseOrders.businessId,
      name: businesses.name,
      totalOrders: sql<number>`COUNT(${purchaseOrders.id})`,
      totalCents: sql<number>`COALESCE(SUM(${purchaseOrders.totalCents}), 0)`,
      lastOrderAt: sql<number>`MAX(${purchaseOrders.createdAt})`,
    })
    .from(purchaseOrders)
    .innerJoin(businesses, eq(businesses.id, purchaseOrders.businessId))
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        sql`${purchaseOrders.status} <> 'cancelled'`,
      ),
    )
    .groupBy(purchaseOrders.businessId, businesses.name);
  // Keyset on (lastOrderAt DESC, businessId ASC): rows strictly after cursor.
  const keyed = cursor
    ? base.having(
        sql`MAX(${purchaseOrders.createdAt}) < ${cursor.lastOrderAt} OR (MAX(${purchaseOrders.createdAt}) = ${cursor.lastOrderAt} AND ${businesses.id} > ${cursor.businessId})`,
      )
    : base;
  const rows = await keyed
    .orderBy(desc(sql`MAX(${purchaseOrders.createdAt})`), businesses.id)
    .all();
  const mapped: CustomerSummary[] = rows.map((r) => ({
    businessId: r.businessId,
    name: r.name,
    totalOrders: Number(r.totalOrders),
    totalCents: Number(r.totalCents),
    lastOrderAt: Number(r.lastOrderAt),
  }));
  const page = mapped.slice(0, limit);
  const hasMore = mapped.length > limit;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: hasMore && last ? encodeCustomerCursor(last.lastOrderAt, last.businessId) : null,
  };
}
