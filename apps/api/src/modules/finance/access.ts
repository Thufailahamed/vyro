import { getDb } from '@vyro/db';
import { businessMembers, purchaseOrders } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import type { Ctx } from '../../middleware/session';
import { isSupplierMember } from '../payments/membership';

export async function assertBusinessAccess(d1: D1Database, ctx: Ctx, businessId: string): Promise<void> {
  if (ctx.isAdmin) return;
  const db = getDb(d1);
  const m = (await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, ctx.userId),
        eq(businessMembers.status, 'active'),
      ),
    )
    .get()) as any;
  if (!m) throw httpError(403, 'FORBIDDEN', 'Not a member of this business');
}

export async function assertSupplierAccess(d1: D1Database, ctx: Ctx, supplierId: string): Promise<void> {
  if (ctx.isAdmin) return;
  if (!(await isSupplierMember(d1, supplierId, ctx.userId))) {
    throw httpError(403, 'FORBIDDEN', 'Not a member of this supplier');
  }
}

/** Payment visibility: PO's business member, PO's supplier member, or admin. */
export async function loadPaymentWithAccess(d1: D1Database, ctx: Ctx, paymentId: string) {
  const db = getDb(d1);
  const { payments } = await import('@vyro/db/schema');
  const payment = (await db.select().from(payments).where(eq(payments.id, paymentId)).get()) as any;
  if (!payment) throw httpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get()) as any;
  if (!po) throw httpError(404, 'NOT_FOUND', 'Order not found');
  if (ctx.isAdmin) return { payment, po };
  const biz = (await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, po.businessId),
        eq(businessMembers.userId, ctx.userId),
        eq(businessMembers.status, 'active'),
      ),
    )
    .get()) as any;
  if (biz) return { payment, po };
  if (await isSupplierMember(d1, po.supplierId, ctx.userId)) return { payment, po };
  throw httpError(403, 'UNAUTHORIZED_FINANCIAL_OPERATION', 'No access to this payment');
}
