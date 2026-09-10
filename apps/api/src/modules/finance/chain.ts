import { getDb } from '@vyro/db';
import {
  payments,
  paymentAttempts,
  paymentAllocations,
  refunds,
  supplierEarnings,
  settlements,
  settlementItems,
  payouts,
  invoices,
  codCollections,
  bankTransfers,
  ledgerEntries,
  financialAdjustments,
  purchaseOrders,
} from '@vyro/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Transaction detail (spec §34): the complete financial chain for one
 * payment — Order → Invoice → Payment → Attempts → Allocations →
 * Refunds → Earnings → Settlement → Payout (+ COD / bank-transfer legs and
 * ledger entries). One query surface so users see where every rupee went.
 */
export async function paymentChain(d1: D1Database, paymentId: string) {
  const db = getDb(d1);
  const payment = (await db.select().from(payments).where(eq(payments.id, paymentId)).get()) as any;
  if (!payment) return null;
  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get()) as any;
  const [attempts, allocations, refundRows, earningRows, invoiceRows, codRows, bankRows, ledgerRows, adjustmentRows] = await Promise.all([
    db.select().from(paymentAttempts).where(eq(paymentAttempts.paymentId, paymentId)).all(),
    db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId)).all(),
    db.select().from(refunds).where(eq(refunds.paymentId, paymentId)).all(),
    db.select().from(supplierEarnings).where(eq(supplierEarnings.paymentId, paymentId)).all(),
    db.select().from(invoices).where(eq(invoices.paymentId, paymentId)).all(),
    db.select().from(codCollections).where(eq(codCollections.paymentId, paymentId)).all(),
    db.select().from(bankTransfers).where(eq(bankTransfers.paymentId, paymentId)).all(),
    db.select().from(ledgerEntries).where(eq(ledgerEntries.refId, paymentId)).all(),
    db.select().from(financialAdjustments).where(eq(financialAdjustments.entityId, paymentId)).all(),
  ]);
  // Settlement → payout legs via earnings.
  const earningIds = (earningRows as any[]).map((e) => e.id);
  let settlementLinks: any[] = [];
  let payoutLinks: any[] = [];
  if (earningIds.length > 0) {
    const { sql } = await import('drizzle-orm');
    const items = (await db
      .select()
      .from(settlementItems)
      .where(sql`${settlementItems.earningId} IN (${sql.join(earningIds.map((id) => sql`${id}`), sql`, `)})`)
      .all()) as any[];
    settlementLinks = items;
    const settlementIds = [...new Set(items.map((i) => i.settlementId))];
    if (settlementIds.length > 0) {
      const settleRows = (await db
        .select()
        .from(settlements)
        .where(sql`${settlements.id} IN (${sql.join(settlementIds.map((id) => sql`${id}`), sql`, `)})`)
        .all()) as any[];
      settlementLinks = items.map((i) => ({ ...i, settlement: settleRows.find((s) => s.id === i.settlementId) ?? null }));
      const linkedPayouts = (await db
        .select()
        .from(payouts)
        .where(sql`${payouts.settlementId} IN (${sql.join(settlementIds.map((id) => sql`${id}`), sql`, `)})`)
        .all()) as any[];
      payoutLinks = linkedPayouts;
    }
  }
  return {
    order: po,
    payment,
    attempts,
    allocations,
    invoices: invoiceRows,
    refunds: refundRows,
    earnings: earningRows,
    settlements: settlementLinks,
    payouts: payoutLinks,
    cod: codRows,
    bankTransfers: bankRows,
    ledger: ledgerRows,
    adjustments: adjustmentRows,
  };
}
