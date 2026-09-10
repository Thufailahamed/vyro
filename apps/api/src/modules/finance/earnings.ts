import { getDb } from '@vyro/db';
import {
  payments,
  purchaseOrders,
  refunds,
  supplierEarnings,
  chargebacks,
} from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { supplierNetCents } from '@vyro/shared';
import { writeLedgerEntry } from '../ledger/writer';
import { resolveCommissionBps, categoryForPo } from './commission';
import { createAllocations, upsertEarningForPayment } from './repository';

/**
 * Ensure allocation + earning rows exist for a confirmed payment.
 * Idempotent: existing rows are reused, never duplicated (spec §13-14).
 *
 * Commission snapshot: resolved once here and stored on both rows, so later
 * rule changes cannot rewrite history (spec §15).
 */
export async function ensureAllocationAndEarning(
  d1: D1Database,
  paymentId: string,
  createdByUserId?: string | null,
) {
  const db = getDb(d1);
  const payment = (await db.select().from(payments).where(eq(payments.id, paymentId)).get()) as any;
  if (!payment) throw new Error('Payment not found');
  const po = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, payment.purchaseOrderId))
    .get()) as any;
  if (!po) throw new Error('PO not found');

  const categoryId = await categoryForPo(d1, po.id).catch(() => undefined);
  const { bps } = await resolveCommissionBps(
    d1,
    { supplierId: po.supplierId, categoryId },
  );

  // Single-supplier allocation (one PO ↔ one supplier in the current model;
  // multi-line POs from one checkout each carry their own payment).
  const { listAllocations } = await import('./repository');
  const existing = await listAllocations(d1, payment.id);
  let allocation = existing[0];
  if (!allocation) {
    const { commissionFor } = await import('./commission');
    const commissionCents = payment.feeCents > 0 ? payment.feeCents : commissionFor(payment.amountCents, bps);
    const created = await createAllocations(d1, [
      {
        paymentId: payment.id,
        supplierId: po.supplierId,
        purchaseOrderId: po.id,
        grossCents: payment.amountCents,
        commissionCents,
        commissionBps: bps,
        feeCents: 0,
        netCents: payment.amountCents - commissionCents,
        currency: payment.currency,
      },
    ]);
    allocation = created[0];
    // Persist the snapshotted commission onto the payment's fee for
    // backwards-compatible aggregates (payouts sum netCents).
    if (payment.feeCents <= 0 && commissionCents > 0) {
      await db
        .update(payments)
        .set({ feeCents: commissionCents, netCents: payment.amountCents - commissionCents, updatedAt: Date.now() })
        .where(eq(payments.id, payment.id))
        .run();
      payment.feeCents = commissionCents;
      payment.netCents = payment.amountCents - commissionCents;
    }
  }

  const net = supplierNetCents({
    grossCents: allocation.grossCents,
    commissionCents: allocation.commissionCents,
  });
  const earning = await upsertEarningForPayment(d1, {
    supplierId: po.supplierId,
    paymentId: payment.id,
    purchaseOrderId: po.id,
    allocationId: allocation.id,
    grossCents: allocation.grossCents,
    commissionBps: allocation.commissionBps,
    commissionCents: allocation.commissionCents,
    deliveryFeeCents: po.deliveryFeeCents ?? 0,
    netCents: net,
    currency: payment.currency,
  });
  await recomputeEligibility(d1, earning.id);

  // Ledger: SALE + COMMISSION are recorded ONCE per earning. Guarded by an
  // existence check so retries/webhook redelivery never duplicate money.
  if (createdByUserId !== undefined) {
    try {
      const { ledgerEntries } = await import('@vyro/db/schema');
      const prior = (await getDb(d1)
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.refId, payment.id), eq(ledgerEntries.category, 'SALE' as never)))
        .get()) as any;
      if (!prior) {
        const dbTx = getDb(d1);
        await dbTx.transaction(async (tx) => {
          writeLedgerEntry(tx as any, {
            accountType: 'supplier',
            accountId: po.supplierId,
            direction: 'credit',
            amountCents: allocation.grossCents,
            currency: payment.currency,
            refType: 'payment',
            refId: payment.id,
            category: 'SALE',
            entityType: 'purchase_order',
            entityId: po.id,
            description: `Sale for PO ${po.poNumber} (payment ${payment.id})`,
            createdByUserId: createdByUserId ?? null,
          });
          if (allocation.commissionCents > 0) {
            writeLedgerEntry(tx as any, {
              accountType: 'platform',
              accountId: 'platform',
              direction: 'credit',
              amountCents: allocation.commissionCents,
              currency: payment.currency,
              refType: 'fee',
              refId: payment.id,
              category: 'COMMISSION',
              entityType: 'purchase_order',
              entityId: po.id,
              description: `VYRO commission ${allocation.commissionBps}bps for PO ${po.poNumber}`,
              createdByUserId: createdByUserId ?? null,
            });
          }
        });
      }
    } catch (err) {
      // Ledger writes are additive projections; a duplicate guard failure
      // must never break payment confirmation. Surface via audit upstream.
      console.error('[earnings] ledger write skipped', err);
    }
  }
  return { allocation, earning };
}

/**
 * Settlement eligibility (spec §21). Eligible iff ALL hold:
 * - payment confirmed (paid)
 * - PO completed (fulfilled + accepted)
 * - PO not disputed
 * - no chargeback open for the payment
 * - no refund in requested/approved/processing for the payment
 * Otherwise held/ineligible with a machine-readable reason.
 */
export async function recomputeEligibility(d1: D1Database, earningId: string) {
  const db = getDb(d1);
  const earning = (await db
    .select()
    .from(supplierEarnings)
    .where(eq(supplierEarnings.id, earningId))
    .get()) as any;
  if (!earning) return null;
  if (earning.eligibility === 'settled') return earning;

  const payment = (await db.select().from(payments).where(eq(payments.id, earning.paymentId)).get()) as any;
  const po = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, earning.purchaseOrderId))
    .get()) as any;

  let eligibility: 'eligible' | 'ineligible' | 'held' = 'eligible';
  let heldReason: string | null = null;

  if (!payment || payment.status !== 'confirmed') {
    eligibility = 'ineligible';
    heldReason = 'payment-not-confirmed';
  } else if (!po) {
    eligibility = 'held';
    heldReason = 'order-missing';
  } else if (po.status === 'disputed') {
    eligibility = 'held';
    heldReason = 'order-disputed';
  } else if (po.status === 'cancelled' || po.status === 'rejected') {
    eligibility = 'ineligible';
    heldReason = `order-${po.status}`;
  } else if (po.status !== 'completed') {
    eligibility = 'ineligible';
    heldReason = 'order-not-completed';
  } else {
    const cb = (await db
      .select()
      .from(chargebacks)
      .where(eq(chargebacks.paymentId, earning.paymentId))
      .get()) as any;
    if (cb && cb.status === 'open') {
      eligibility = 'held';
      heldReason = 'chargeback-open';
    } else {
      const pendingRefund = (await db
        .select()
        .from(refunds)
        .where(eq(refunds.paymentId, earning.paymentId))
        .all()) as any[];
      if (pendingRefund.some((r) => ['requested', 'approved', 'processing'].includes(r.status))) {
        eligibility = 'held';
        heldReason = 'refund-pending';
      }
    }
  }

  await db
    .update(supplierEarnings)
    .set({ eligibility, heldReason, updatedAt: Date.now() })
    .where(eq(supplierEarnings.id, earningId))
    .run();
  return { ...earning, eligibility, heldReason };
}

export async function recomputeEligibilityForPo(d1: D1Database, poId: string) {
  const db = getDb(d1);
  const rows = (await db
    .select({ id: supplierEarnings.id })
    .from(supplierEarnings)
    .where(eq(supplierEarnings.purchaseOrderId, poId))
    .all()) as Array<{ id: string }>;
  for (const r of rows) {
    try {
      await recomputeEligibility(d1, r.id);
    } catch (err) {
      console.error('[earnings] recompute failed', { earningId: r.id, err });
    }
  }
}

export async function recomputeEligibilityForPayment(d1: D1Database, paymentId: string) {
  const db = getDb(d1);
  const rows = (await db
    .select({ id: supplierEarnings.id })
    .from(supplierEarnings)
    .where(and(eq(supplierEarnings.paymentId, paymentId)))
    .all()) as Array<{ id: string }>;
  for (const r of rows) {
    try {
      await recomputeEligibility(d1, r.id);
    } catch (err) {
      console.error('[earnings] recompute failed', { earningId: r.id, err });
    }
  }
}
