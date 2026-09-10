import type { IntentContext, HandlerResult } from './catalog';
import { businessOverview, businessInvoices } from '../../finance/reports';
import { getDb } from '@vyro/db';
import { payments, purchaseOrders, refunds } from '@vyro/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

/**
 * finance_status: READ-ONLY financial summary for "Show me pending
 * payments", "Which invoices are unpaid?", "What do I owe?", "My refunds?".
 *
 * SECURITY: summarizes actual ledger records scoped to the caller's
 * businessId (enforced by the orchestrator). NEVER executes refunds,
 * payouts, verifications, or adjustments — there is no write path here.
 */
export async function financeStatusHandler(ctx: IntentContext): Promise<HandlerResult> {
  const topic = (ctx.classify.slots as { financeTopic?: string }).financeTopic ?? 'overview';
  const overview = await businessOverview(ctx.env.DB as D1Database, ctx.businessId);
  const db = getDb(ctx.env.DB as D1Database);

  const poIds = (await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.businessId, ctx.businessId))
    .all()) as Array<{ id: string }>;
  const ids = poIds.map((p) => p.id);

  let pending: any[] = [];
  let unpaidInvoices: any[] = [];
  let recentRefunds: any[] = [];
  if (ids.length > 0) {
    const inPo = sql`${payments.purchaseOrderId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
    if (topic === 'pending_payments' || topic === 'overview') {
      pending = (await db
        .select({ id: payments.id, amountCents: payments.amountCents, status: payments.status, method: payments.method, purchaseOrderId: payments.purchaseOrderId, createdAt: payments.createdAt })
        .from(payments)
        .where(and(inPo, eq(payments.status, 'pending')))
        .orderBy(desc(payments.createdAt))
        .limit(8)
        .all()) as any[];
    }
    if (topic === 'unpaid_invoices' || topic === 'overview') {
      const all = await businessInvoices(ctx.env.DB as D1Database, ctx.businessId, 50);
      const paidPo = new Set(
        ((await db.select({ poId: payments.purchaseOrderId }).from(payments).where(and(inPo, eq(payments.status, 'confirmed'))).all()) as any[]).map((r) => r.poId),
      );
      unpaidInvoices = all.filter((inv: any) => !paidPo.has(inv.purchaseOrderId)).slice(0, 8);
    }
    if (topic === 'refunds' || topic === 'overview') {
      const payIds = (await db.select({ id: payments.id }).from(payments).where(inPo).all()) as Array<{ id: string }>;
      if (payIds.length > 0) {
        const pids = payIds.map((p) => p.id);
        recentRefunds = (await db
          .select()
          .from(refunds)
          .where(sql`${refunds.paymentId} IN (${sql.join(pids.map((id) => sql`${id}`), sql`, `)})`)
          .orderBy(desc(refunds.createdAt))
          .limit(8)
          .all()) as any[];
      }
    }
  }

  const data = {
    topic,
    currency: 'LKR',
    paidCents: overview.paidCents,
    pendingCents: overview.pendingCents,
    refundedCents: overview.refundedCents,
    outstandingCents: overview.outstandingCents,
    pendingPayments: pending.map((p) => ({ id: p.id, amountCents: p.amountCents, method: p.method, purchaseOrderId: p.purchaseOrderId })),
    unpaidInvoices: unpaidInvoices.map((i: any) => ({ id: i.id, number: i.number, totalCents: i.totalCents, purchaseOrderId: i.purchaseOrderId })),
    recentRefunds: recentRefunds.map((r: any) => ({ id: r.id, amountCents: r.amountCents, status: r.status })),
  };
  return {
    components: [{ type: 'finance_status_card', data: data as unknown as Record<string, unknown> }],
    actions: [{ type: 'view_invoices', label: 'Open accounts', href: '/accounts' }],
    rawSummary: {
      topic,
      paidCents: overview.paidCents,
      pendingCents: overview.pendingCents,
      refundedCents: overview.refundedCents,
      outstandingCents: overview.outstandingCents,
      pendingCount: pending.length,
      unpaidInvoiceCount: unpaidInvoices.length,
      refundCount: recentRefunds.length,
    },
  };
}
