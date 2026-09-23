import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { creditDrawdowns, payments, purchaseOrders, refunds } from '@vyro/db/schema';
import type { PaymentState, PaymentSummary, PaymentSummaryMethod } from '@vyro/shared';

const PENDING_REFUND = ['requested', 'approved', 'processing'];

/**
 * Derived payment position of one order. Never stored — computed from the
 * payments / refunds / credit rows so it cannot drift from the money tables.
 */
export function summarize(input: {
  totalCents: number;
  payments: Array<{ method: string; status: string; amountCents: number }>;
  refunds: Array<{ status: string; amountCents: number }>;
  drawdown: { amountCents: number; releasedCents: number } | null;
}): PaymentSummary {
  const paidCents = input.payments
    .filter((p) => p.status === 'confirmed' || p.status === 'refunded')
    .reduce((s, p) => s + p.amountCents, 0);
  const refundedCents = input.refunds.filter((r) => r.status === 'completed').reduce((s, r) => s + r.amountCents, 0);
  const pendingRefundCents = input.refunds
    .filter((r) => PENDING_REFUND.includes(r.status))
    .reduce((s, r) => s + r.amountCents, 0);
  const netPaid = paidCents - refundedCents;
  const hasCredit = !!input.drawdown && input.drawdown.amountCents - input.drawdown.releasedCents > 0;
  const hasPendingCash = input.payments.some((p) => p.method === 'cash' && p.status === 'pending');

  let method: PaymentSummaryMethod = 'none';
  if (input.drawdown) method = 'credit';
  else if (input.payments.some((p) => p.method === 'cash')) method = 'cod';
  else {
    const last = input.payments.filter((p) => p.status !== 'failed' && p.status !== 'cancelled').at(-1);
    if (last) method = last.method === 'online' ? 'online' : 'bank_transfer';
  }

  let state: PaymentState;
  if (refundedCents > 0 && netPaid <= 0) state = 'refunded';
  else if (hasCredit) state = 'credit';
  else if (input.totalCents > 0 && netPaid >= input.totalCents) state = refundedCents > 0 ? 'partially_refunded' : 'paid';
  else if (hasPendingCash) state = 'cod_pending';
  else if (netPaid > 0) state = 'partially_paid';
  else state = 'unpaid';

  const dueCents = hasCredit ? 0 : Math.max(0, input.totalCents - netPaid);
  return { method, state, totalCents: input.totalCents, paidCents, refundedCents, pendingRefundCents, dueCents };
}

export async function getPaymentSummary(d1: D1Database, poId: string): Promise<PaymentSummary | null> {
  const db = getDb(d1);
  const po = await db
    .select({ id: purchaseOrders.id, totalCents: purchaseOrders.totalCents })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId))
    .get();
  if (!po) return null;
  const pays = await db
    .select({ id: payments.id, method: payments.method, status: payments.status, amountCents: payments.amountCents, createdAt: payments.createdAt })
    .from(payments)
    .where(eq(payments.purchaseOrderId, poId))
    .all();
  pays.sort((a, b) => a.createdAt - b.createdAt);
  const refs = pays.length
    ? await db
        .select({ status: refunds.status, amountCents: refunds.amountCents })
        .from(refunds)
        .where(inArray(refunds.paymentId, pays.map((p) => p.id)))
        .all()
    : [];
  const dd = await db
    .select({ amountCents: creditDrawdowns.amountCents, releasedCents: creditDrawdowns.releasedCents })
    .from(creditDrawdowns)
    .where(eq(creditDrawdowns.purchaseOrderId, poId))
    .get();
  return summarize({ totalCents: po.totalCents, payments: pays, refunds: refs, drawdown: dd ?? null });
}

/** Batch variant for list endpoints (one query per table, not per order). */
export async function getPaymentSummaries(
  d1: D1Database,
  orders: Array<{ id: string; totalCents: number }>,
): Promise<Map<string, PaymentSummary>> {
  const out = new Map<string, PaymentSummary>();
  if (orders.length === 0) return out;
  const db = getDb(d1);
  const ids = orders.map((o) => o.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 90) chunks.push(ids.slice(i, i + 90));
  const pays: Array<{ id: string; purchaseOrderId: string; method: string; status: string; amountCents: number; createdAt: number }> = [];
  const dds: Array<{ purchaseOrderId: string; amountCents: number; releasedCents: number }> = [];
  for (const chunk of chunks) {
    pays.push(
      ...(await db
        .select({
          id: payments.id,
          purchaseOrderId: payments.purchaseOrderId,
          method: payments.method,
          status: payments.status,
          amountCents: payments.amountCents,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .where(inArray(payments.purchaseOrderId, chunk))
        .all()),
    );
    dds.push(
      ...(await db
        .select({
          purchaseOrderId: creditDrawdowns.purchaseOrderId,
          amountCents: creditDrawdowns.amountCents,
          releasedCents: creditDrawdowns.releasedCents,
        })
        .from(creditDrawdowns)
        .where(inArray(creditDrawdowns.purchaseOrderId, chunk))
        .all()),
    );
  }
  const refs: Array<{ paymentId: string; status: string; amountCents: number }> = [];
  const payIds = pays.map((p) => p.id);
  for (let i = 0; i < payIds.length; i += 90) {
    refs.push(
      ...(await db
        .select({ paymentId: refunds.paymentId, status: refunds.status, amountCents: refunds.amountCents })
        .from(refunds)
        .where(inArray(refunds.paymentId, payIds.slice(i, i + 90)))
        .all()),
    );
  }
  pays.sort((a, b) => a.createdAt - b.createdAt);
  for (const o of orders) {
    const p = pays.filter((x) => x.purchaseOrderId === o.id);
    const pid = new Set(p.map((x) => x.id));
    out.set(
      o.id,
      summarize({
        totalCents: o.totalCents,
        payments: p,
        refunds: refs.filter((r) => pid.has(r.paymentId)),
        drawdown: dds.find((d) => d.purchaseOrderId === o.id) ?? null,
      }),
    );
  }
  return out;
}
