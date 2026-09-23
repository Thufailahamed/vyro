import { getDb } from '@vyro/db';
import { creditDrawdowns, creditFacilities } from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import { and, eq, lt } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import { writeLedgerEntry } from '../ledger/writer';
import type { CreditTerms } from '@vyro/validation';

export const CREDIT_DEFAULT_LIMIT_CENTS = 10_000_000;
export const CREDIT_MIN_PAID_ORDERS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function dueAtForTerms(terms: CreditTerms, now: number): number {
  return now + (terms === 'net14' ? 14 * DAY_MS : 30 * DAY_MS);
}

export function availableCents(f: { limitCents: number; usedCents: number }): number {
  return f.limitCents - f.usedCents;
}

export function evaluateEligibility(args: {
  paidOrderCount: number;
  overdueCount: number;
  facility: { status: string } | null;
}): { eligible: boolean; reason: string | null } {
  if (args.facility && (args.facility.status === 'suspended' || args.facility.status === 'closed')) {
    return { eligible: false, reason: 'credit_not_eligible' };
  }
  if (args.overdueCount > 0) return { eligible: false, reason: 'credit_overdue_blocked' };
  // An active facility (auto-grant or admin/test grant) is enough to draw.
  // Paid-order count only gates auto-creation when no facility exists yet.
  if (args.facility?.status === 'active') return { eligible: true, reason: null };
  if (args.paidOrderCount < CREDIT_MIN_PAID_ORDERS) return { eligible: false, reason: 'credit_not_eligible' };
  return { eligible: true, reason: null };
}

type DbTx = ReturnType<typeof getDb>;

export async function createDrawdownsForCheckout(
  tx: DbTx,
  args: { businessId: string; userId: string; terms: CreditTerms; poAmounts: Array<{ poId: string; amountCents: number }>; now: number },
): Promise<void> {
  for (const po of args.poAmounts) {
    if (po.amountCents <= 0) throw httpError(400, 'VALIDATION_ERROR', 'PO amount must be positive');
    const existing = await tx.select({ id: creditDrawdowns.id }).from(creditDrawdowns).where(eq(creditDrawdowns.purchaseOrderId, po.poId)).get();
    if (existing) throw httpError(409, 'credit_drawdown_exists', 'Drawdown already exists for PO');
    const row = {
      id: newId(),
      businessId: args.businessId,
      purchaseOrderId: po.poId,
      amountCents: po.amountCents,
      repaidCents: 0,
      terms: args.terms,
      dueAt: dueAtForTerms(args.terms, args.now),
      status: 'active' as const,
      repaidAt: null,
      createdAt: args.now,
      updatedAt: args.now,
    };
    tx.insert(creditDrawdowns).values(row).run();
    writeLedgerEntry(tx, {
      accountType: 'business',
      accountId: args.businessId,
      direction: 'debit',
      amountCents: po.amountCents,
      currency: 'LKR',
      refType: 'adjustment',
      refId: po.poId,
      category: 'CREDIT',
      entityType: 'credit_drawdown',
      entityId: row.id,
      description: `Credit draw ${args.terms} for PO ${po.poId}`.slice(0, 500),
      createdByUserId: args.userId,
    });
  }
  const facility = await tx.select().from(creditFacilities).where(eq(creditFacilities.businessId, args.businessId)).get() as any;
  if (!facility) throw httpError(403, 'credit_not_eligible', 'No credit facility');
  const total = args.poAmounts.reduce((s, p) => s + p.amountCents, 0);
  if (facility.usedCents + total > facility.limitCents) throw httpError(402, 'credit_limit_exceeded', 'Exceeds credit limit');
  tx.update(creditFacilities)
    .set({ usedCents: facility.usedCents + total, updatedAt: args.now })
    .where(eq(creditFacilities.businessId, args.businessId))
    .run();
}

export async function applyRepayment(
  tx: DbTx,
  args: { businessId: string; drawdownId: string; amountCents: number; paymentId: string; userId: string; now: number },
): Promise<{ fullyRepaid: boolean }> {
  const dd = await tx.select().from(creditDrawdowns).where(eq(creditDrawdowns.id, args.drawdownId)).get() as any;
  if (!dd || dd.businessId !== args.businessId) throw httpError(404, 'NOT_FOUND', 'Drawdown not found');
  if (args.amountCents <= 0) throw httpError(400, 'VALIDATION_ERROR', 'Amount must be positive');
  const owed = dd.amountCents - (dd.releasedCents ?? 0);
  const remaining = owed - dd.repaidCents;
  if (args.amountCents > remaining) throw httpError(400, 'VALIDATION_ERROR', 'Repayment exceeds remaining balance');
  const nextRepaid = dd.repaidCents + args.amountCents;
  const fullyRepaid = nextRepaid >= owed;
  tx.update(creditDrawdowns)
    .set({ repaidCents: nextRepaid, status: fullyRepaid ? 'repaid' : dd.status, repaidAt: fullyRepaid ? args.now : dd.repaidAt, updatedAt: args.now })
    .where(eq(creditDrawdowns.id, args.drawdownId))
    .run();
  const facility = await tx.select().from(creditFacilities).where(eq(creditFacilities.businessId, args.businessId)).get() as any;
  if (!facility) throw httpError(403, 'credit_not_eligible', 'No credit facility');
  tx.update(creditFacilities)
    .set({ usedCents: Math.max(0, facility.usedCents - args.amountCents), updatedAt: args.now })
    .where(eq(creditFacilities.businessId, args.businessId))
    .run();
  writeLedgerEntry(tx, {
    accountType: 'business',
    accountId: args.businessId,
    direction: 'credit',
    amountCents: args.amountCents,
    currency: 'LKR',
    refType: 'adjustment',
    refId: args.paymentId,
    category: 'DEBIT',
    entityType: 'credit_drawdown',
    entityId: args.drawdownId,
    description: `Credit repayment for drawdown ${args.drawdownId}`.slice(0, 500),
    createdByUserId: args.userId,
  });
  return { fullyRepaid };
}

/**
 * Gives credit back when an order shrinks (partial accept, return) or dies
 * (cancel, reject, dispute refund). Releases up to the outstanding balance
 * (amount − repaid − released); anything the buyer already repaid beyond the
 * new order value is reported back as `overpaidCents` so the caller can
 * refund it. Idempotent per call only — callers pass deterministic amounts.
 */
export async function releaseDrawdown(
  d1: D1Database,
  args: { poId: string; amountCents?: number; userId: string | null; reason: string; now?: number },
): Promise<{ releasedCents: number; overpaidCents: number } | null> {
  const db = getDb(d1);
  const now = args.now ?? Date.now();
  const dd = (await db.select().from(creditDrawdowns).where(eq(creditDrawdowns.purchaseOrderId, args.poId)).get()) as
    | (typeof creditDrawdowns.$inferSelect)
    | undefined;
  if (!dd) return null;
  const effective = dd.amountCents - dd.releasedCents;
  const reduceBy = Math.min(args.amountCents ?? effective, effective);
  if (reduceBy <= 0) return { releasedCents: 0, overpaidCents: 0 };
  const outstanding = Math.max(0, effective - dd.repaidCents);
  const releasedCents = Math.min(reduceBy, outstanding);
  const overpaidCents = reduceBy - releasedCents;
  const nextReleased = dd.releasedCents + reduceBy;
  const fullyGone = nextReleased >= dd.amountCents;
  const settled = dd.repaidCents >= dd.amountCents - nextReleased;
  await db
    .update(creditDrawdowns)
    .set({
      releasedCents: nextReleased,
      releasedAt: now,
      status: fullyGone ? 'released' : settled ? 'repaid' : dd.status,
      repaidAt: !fullyGone && settled && !dd.repaidAt ? now : dd.repaidAt,
      updatedAt: now,
    })
    .where(eq(creditDrawdowns.id, dd.id))
    .run();
  if (releasedCents > 0) {
    const facility = (await db.select().from(creditFacilities).where(eq(creditFacilities.businessId, dd.businessId)).get()) as
      | { usedCents: number }
      | undefined;
    if (facility) {
      await db
        .update(creditFacilities)
        .set({ usedCents: Math.max(0, facility.usedCents - releasedCents), updatedAt: now })
        .where(eq(creditFacilities.businessId, dd.businessId))
        .run();
    }
    await writeLedgerEntry(db, {
      accountType: 'business',
      accountId: dd.businessId,
      direction: 'credit',
      amountCents: releasedCents,
      currency: 'LKR',
      refType: 'adjustment',
      refId: args.poId,
      category: 'CREDIT',
      entityType: 'credit_drawdown',
      entityId: dd.id,
      description: `Credit released (${args.reason}) for PO ${args.poId}`.slice(0, 500),
      createdByUserId: args.userId,
    });
  }
  return { releasedCents, overpaidCents };
}

export async function sweepOverdue(d1: D1Database, now: number): Promise<number> {
  const db = getDb(d1);
  const rows = await db
    .select({ id: creditDrawdowns.id })
    .from(creditDrawdowns)
    .where(and(eq(creditDrawdowns.status, 'active' as never), lt(creditDrawdowns.dueAt, now)))
    .all();
  for (const r of rows as Array<{ id: string }>) {
    await db.update(creditDrawdowns).set({ status: 'overdue' as never, updatedAt: now }).where(eq(creditDrawdowns.id, r.id)).run();
  }
  return (rows as unknown[]).length;
}

export function assertLimitChange(facility: { usedCents: number }, nextLimitCents: number): void {
  if (nextLimitCents < facility.usedCents) throw httpError(422, 'credit_limit_below_used', 'Limit cannot be below used amount');
}
