import { getDb } from '@vyro/db';
import {
  payments,
  refunds,
  invoices,
  purchaseOrders,
  supplierEarnings,
  settlements,
  payouts,
  codCollections,
  bankTransfers,
  ledgerEntries,
} from '@vyro/db/schema';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

/**
 * Reporting engine (spec §42). All figures come from real financial records
 * — no hardcoded numbers. Amounts are integer minor units (cents).
 */

export interface BusinessOverview {
  totalSpendCents: number;
  paidCents: number;
  pendingCents: number;
  refundedCents: number;
  outstandingCents: number;
  byMethod: Array<{ method: string; cents: number; count: number }>;
  recentPayments: any[];
}

export async function businessOverview(d1: D1Database, businessId: string): Promise<BusinessOverview> {
  const db = getDb(d1);
  const pos = (await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.businessId, businessId)).all()) as any[];
  const poIds = pos.map((p: any) => p.id);
  if (poIds.length === 0) {
    return { totalSpendCents: 0, paidCents: 0, pendingCents: 0, refundedCents: 0, outstandingCents: 0, byMethod: [], recentPayments: [] };
  }
  const payRows = (await db.select().from(payments).where(sql`${payments.purchaseOrderId} IN (${sql.join(poIds.map((id) => sql`${id}`), sql`, `)})`).all()) as any[];
  let paid = 0;
  let pending = 0;
  const byMethod = new Map<string, { cents: number; count: number }>();
  for (const p of payRows) {
    const m = byMethod.get(p.method) ?? { cents: 0, count: 0 };
    m.cents += p.amountCents;
    m.count += 1;
    byMethod.set(p.method, m);
    if (p.status === 'confirmed') paid += p.amountCents;
    else if (p.status === 'pending') pending += p.amountCents;
  }
  const paymentIds = payRows.map((p: any) => p.id);
  let refunded = 0;
  if (paymentIds.length > 0) {
    const r = (await db
      .select({ s: sql<number>`COALESCE(SUM(amount_cents),0)` })
      .from(refunds)
      .where(and(sql`${refunds.paymentId} IN (${sql.join(paymentIds.map((id) => sql`${id}`), sql`, `)})`, eq(refunds.status, 'completed')))
      .get()) as any;
    refunded = Number(r?.s ?? 0);
  }
  const orderTotal = Number(
    ((await db.select({ s: sql<number>`COALESCE(SUM(total_cents),0)` }).from(purchaseOrders).where(eq(purchaseOrders.businessId, businessId)).get()) as any)?.s ?? 0,
  );
  const recent = payRows.sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 10);
  return {
    totalSpendCents: orderTotal,
    paidCents: paid,
    pendingCents: pending,
    refundedCents: refunded,
    outstandingCents: Math.max(0, orderTotal - paid),
    byMethod: [...byMethod.entries()].map(([method, v]) => ({ method, ...v })),
    recentPayments: recent,
  };
}

export interface SupplierOverview {
  grossCents: number;
  commissionCents: number;
  refundCents: number;
  adjustmentCents: number;
  netCents: number;
  paidOutCents: number;
  pendingSettlementCents: number;
  availableCents: number;
  todayCents: number;
  monthCents: number;
  recentEarnings: any[];
}

export async function supplierOverview(d1: D1Database, supplierId: string): Promise<SupplierOverview> {
  const db = getDb(d1);
  const agg = (await db
    .select({
      gross: sql<number>`COALESCE(SUM(gross_cents),0)`,
      commission: sql<number>`COALESCE(SUM(commission_cents),0)`,
      refunds: sql<number>`COALESCE(SUM(refund_cents),0)`,
      adjustments: sql<number>`COALESCE(SUM(adjustment_cents),0)`,
      net: sql<number>`COALESCE(SUM(net_cents),0)`,
      eligible: sql<number>`COALESCE(SUM(CASE WHEN eligibility='eligible' THEN net_cents ELSE 0 END),0)`,
    })
    .from(supplierEarnings)
    .where(eq(supplierEarnings.supplierId, supplierId))
    .get()) as any;
  const paidOut = Number(
    ((await db
      .select({ s: sql<number>`COALESCE(SUM(net_cents),0)` })
      .from(payouts)
      .where(and(eq(payouts.supplierId, supplierId), sql`status IN ('paid','completed')`))
      .get()) as any)?.s ?? 0,
  );
  const settled = Number(
    ((await db
      .select({ s: sql<number>`COALESCE(SUM(net_cents),0)` })
      .from(supplierEarnings)
      .where(and(eq(supplierEarnings.supplierId, supplierId), eq(supplierEarnings.eligibility, 'settled')))
      .get()) as any)?.s ?? 0,
  );
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const today = Number(
    ((await db
      .select({ s: sql<number>`COALESCE(SUM(net_cents),0)` })
      .from(supplierEarnings)
      .where(and(eq(supplierEarnings.supplierId, supplierId), gte(supplierEarnings.createdAt, dayStart.getTime())))
      .get()) as any)?.s ?? 0,
  );
  const month = Number(
    ((await db
      .select({ s: sql<number>`COALESCE(SUM(net_cents),0)` })
      .from(supplierEarnings)
      .where(and(eq(supplierEarnings.supplierId, supplierId), gte(supplierEarnings.createdAt, monthStart.getTime())))
      .get()) as any)?.s ?? 0,
  );
  const recent = (await db
    .select()
    .from(supplierEarnings)
    .where(eq(supplierEarnings.supplierId, supplierId))
    .orderBy(desc(supplierEarnings.createdAt))
    .limit(10)
    .all()) as any[];
  const net = Number(agg?.net ?? 0);
  return {
    grossCents: Number(agg?.gross ?? 0),
    commissionCents: Number(agg?.commission ?? 0),
    refundCents: Number(agg?.refunds ?? 0),
    adjustmentCents: Number(agg?.adjustments ?? 0),
    netCents: net,
    paidOutCents: paidOut,
    pendingSettlementCents: settled - paidOut >= 0 ? settled - paidOut : 0,
    availableCents: Number(agg?.eligible ?? 0),
    todayCents: today,
    monthCents: month,
    recentEarnings: recent,
  };
}

export interface AdminOverview {
  gmvCents: number;
  successfulPayments: number;
  successfulCents: number;
  pendingPayments: number;
  pendingCents: number;
  failedPayments: number;
  refundedCents: number;
  refundCount: number;
  refundRateBps: number;
  codOutstandingCents: number;
  codOutstandingCount: number;
  bankTransferQueueCount: number;
  supplierPayableCents: number;
  commissionCents: number;
  pendingSettlementsCents: number;
  completedPayoutsCents: number;
  byMethod: Array<{ method: string; cents: number; count: number }>;
}

export async function adminOverview(d1: D1Database): Promise<AdminOverview> {
  const db = getDb(d1);
  const pay = (await db
    .select({
      status: payments.status,
      n: sql<number>`COUNT(*)`,
      sum: sql<number>`COALESCE(SUM(amount_cents),0)`,
    })
    .from(payments)
    .all()) as any[];
  const byStatus = new Map(pay.map((r: any) => [r.status, r]));
  const successful = byStatus.get('confirmed') ?? { n: 0, sum: 0 };
  const pending = byStatus.get('pending') ?? { n: 0, sum: 0 };
  const failed = byStatus.get('failed') ?? { n: 0, sum: 0 };
  const methods = (await db
    .select({ method: payments.method, n: sql<number>`COUNT(*)`, sum: sql<number>`COALESCE(SUM(amount_cents),0)` })
    .from(payments)
    .all()) as any[];
  const refundsAgg = (await db
    .select({ n: sql<number>`COUNT(*)`, sum: sql<number>`COALESCE(SUM(amount_cents),0)` })
    .from(refunds)
    .where(eq(refunds.status, 'completed'))
    .get()) as any;
  const gmv = pay.reduce((a: number, r: any) => a + Number(r.sum ?? 0), 0);
  const refunded = Number(refundsAgg?.sum ?? 0);
  const cod = (await db
    .select({ n: sql<number>`COUNT(*)`, sum: sql<number>`COALESCE(SUM(expected_cents),0)` })
    .from(codCollections)
    .where(sql`collected_cents IS NULL`)
    .get()) as any;
  const btQueue = Number(
    ((await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(bankTransfers)
      .where(sql`status IN ('pending','proof_submitted','pending_verification','correction_requested')`)
      .get()) as any)?.n ?? 0,
  );
  const payable = Number(
    ((await db
      .select({ s: sql<number>`COALESCE(SUM(net_cents),0)` })
      .from(supplierEarnings)
      .where(sql`eligibility IN ('eligible','settled')`)
      .get()) as any)?.s ?? 0,
  );
  const commission = Number(
    ((await db.select({ s: sql<number>`COALESCE(SUM(commission_cents),0)` }).from(supplierEarnings).get()) as any)?.s ?? 0,
  );
  const pendingSettle = Number(
    ((await db
      .select({ s: sql<number>`COALESCE(SUM(net_cents),0)` })
      .from(settlements)
      .where(sql`status IN ('pending','approved','processing')`)
      .get()) as any)?.s ?? 0,
  );
  const completedPayouts = Number(
    ((await db
      .select({ s: sql<number>`COALESCE(SUM(net_cents),0)` })
      .from(payouts)
      .where(sql`status IN ('paid','completed')`)
      .get()) as any)?.s ?? 0,
  );
  const totalPaid = Number(successful.sum ?? 0);
  return {
    gmvCents: gmv,
    successfulPayments: Number(successful.n ?? 0),
    successfulCents: totalPaid,
    pendingPayments: Number(pending.n ?? 0),
    pendingCents: Number(pending.sum ?? 0),
    failedPayments: Number(failed.n ?? 0),
    refundedCents: refunded,
    refundCount: Number(refundsAgg?.n ?? 0),
    refundRateBps: totalPaid > 0 ? Math.floor((refunded * 10000) / totalPaid) : 0,
    codOutstandingCents: Number(cod?.sum ?? 0),
    codOutstandingCount: Number(cod?.n ?? 0),
    bankTransferQueueCount: btQueue,
    supplierPayableCents: payable,
    commissionCents: commission,
    pendingSettlementsCents: pendingSettle,
    completedPayoutsCents: completedPayouts,
    byMethod: methods.map((m: any) => ({ method: m.method, cents: Number(m.sum ?? 0), count: Number(m.n ?? 0) })),
  };
}

export async function businessTransactions(d1: D1Database, businessId: string, opts: { from?: number | undefined; to?: number | undefined; limit?: number | undefined; cursor?: number | undefined }) {
  const db = getDb(d1);
  const conds: any[] = [eq(ledgerEntries.accountType, 'business'), eq(ledgerEntries.accountId, businessId)];
  if (opts.from !== undefined) conds.push(gte(ledgerEntries.createdAt, opts.from));
  if (opts.to !== undefined) conds.push(lte(ledgerEntries.createdAt, opts.to));
  if (opts.cursor !== undefined) conds.push(sql`${ledgerEntries.createdAt} < ${opts.cursor}`);
  return (await db
    .select()
    .from(ledgerEntries)
    .where(and(...conds))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200))
    .all()) as any[];
}

export async function supplierTransactions(d1: D1Database, supplierId: string, opts: { from?: number | undefined; to?: number | undefined; limit?: number | undefined; cursor?: number | undefined }) {
  const db = getDb(d1);
  const conds: any[] = [eq(ledgerEntries.accountType, 'supplier'), eq(ledgerEntries.accountId, supplierId)];
  if (opts.from !== undefined) conds.push(gte(ledgerEntries.createdAt, opts.from));
  if (opts.to !== undefined) conds.push(lte(ledgerEntries.createdAt, opts.to));
  if (opts.cursor !== undefined) conds.push(sql`${ledgerEntries.createdAt} < ${opts.cursor}`);
  return (await db
    .select()
    .from(ledgerEntries)
    .where(and(...conds))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200))
    .all()) as any[];
}

export async function businessInvoices(d1: D1Database, businessId: string, limit = 50, cursor?: number) {
  const db = getDb(d1);
  const conds: any[] = [eq(invoices.businessId, businessId)];
  if (cursor !== undefined) conds.push(sql`${invoices.issuedAt} < ${cursor}`);
  const rows = (await db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      purchaseOrderId: invoices.purchaseOrderId,
      supplierId: invoices.supplierId,
      subtotalCents: invoices.subtotalCents,
      taxCents: invoices.taxCents,
      totalCents: invoices.totalCents,
      currency: invoices.currency,
      issuedAt: invoices.issuedAt,
      paymentId: invoices.paymentId,
    })
    .from(invoices)
    .where(and(...conds))
    .orderBy(desc(invoices.issuedAt))
    .limit(limit)
    .all()) as any[];
  return rows;
}
