import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { payments, purchaseOrders } from '@vyro/db/schema';

export type PaymentListItem = {
  id: string;
  purchaseOrderId: string;
  supplierId: string;
  businessId: string;
  poNumber: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  status: string;
  method: string;
  transactionReference: string | null;
  gatewayRef: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
  notes: string | null;
  createdAt: number;
};

/**
 * List payments for a supplier. Cursor is the createdAt of the last item from
 * the prior page (lt for desc order). Fixes the original inverted cursor bug.
 */
export async function listPaymentsForSupplier(
  d1: D1Database,
  supplierId: string,
  cursor: number | undefined,
  status: string | undefined,
  limit = 50,
): Promise<PaymentListItem[]> {
  const db = getDb(d1);
  const conds = [eq(purchaseOrders.supplierId, supplierId)];
  if (cursor !== undefined) conds.push(lt(payments.createdAt, cursor));
  if (status) conds.push(eq(payments.status, status as 'pending' | 'confirmed' | 'failed' | 'refunded'));

  const rows = await db
    .select({
      id: payments.id,
      purchaseOrderId: payments.purchaseOrderId,
      supplierId: purchaseOrders.supplierId,
      businessId: purchaseOrders.businessId,
      poNumber: purchaseOrders.poNumber,
      amountCents: payments.amountCents,
      feeCents: payments.feeCents,
      netCents: payments.netCents,
      currency: payments.currency,
      status: payments.status,
      method: payments.method,
      transactionReference: payments.transactionReference,
      gatewayRef: payments.gatewayRef,
      paidAt: payments.paidAt,
      confirmedAt: payments.confirmedAt,
      notes: payments.notes,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, payments.purchaseOrderId))
    .where(and(...conds))
    .orderBy(desc(payments.createdAt))
    .limit(limit)
    .all();
  return rows;
}

/**
 * Sum of confirmed payment amounts for a PO. Used for partial-payment guards.
 */
export async function sumConfirmedPaymentsForPo(
  d1: D1Database,
  poId: string,
): Promise<{ confirmedCents: number; refundedCents: number }> {
  const db = getDb(d1);
  const row = (await db
    .select({
      confirmed: sql<number>`COALESCE(SUM(CASE WHEN status='confirmed' THEN amount_cents ELSE 0 END), 0)`,
      refunded: sql<number>`COALESCE(SUM(CASE WHEN status='refunded' THEN amount_cents ELSE 0 END), 0)`,
    })
    .from(payments)
    .where(eq(payments.purchaseOrderId, poId))
    .get()) as any;
  return {
    confirmedCents: Number(row?.confirmed ?? 0),
    refundedCents: Number(row?.refunded ?? 0),
  };
}

export async function findPaymentForUpdate(
  d1: D1Database,
  id: string,
): Promise<typeof payments.$inferSelect | null> {
  const db = getDb(d1);
  return ((await db.select().from(payments).where(eq(payments.id, id)).get()) ?? null) as typeof payments.$inferSelect | null;
}
