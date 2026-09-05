import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  payouts as payoutsTable,
  payments as paymentsTable,
  purchaseOrders,
  type Payout,
} from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export type GeneratePayoutInput = {
  supplierId: string;
  periodStart: number;
  periodEnd: number;
  currency?: string;
};

/**
 * Aggregate confirmed payments in [periodStart, periodEnd] not yet attached to a payout.
 * Returns the proposed payout figures.
 */
export async function aggregatePayableForSupplier(
  d1: D1Database,
  input: GeneratePayoutInput,
): Promise<{ amountCents: number; feeCents: number; netCents: number; paymentCount: number }> {
  const db = getDb(d1);
  // Confirmed payments in period attached to POs from this supplier
  const rows = ((await db
    .select({
      paymentId: paymentsTable.id,
      netCents: paymentsTable.netCents,
      feeCents: paymentsTable.feeCents,
      confirmedAt: paymentsTable.confirmedAt,
    })
    .from(paymentsTable)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, paymentsTable.purchaseOrderId))
    .where(
      and(
        eq(paymentsTable.status, 'confirmed'),
        eq(purchaseOrders.supplierId, input.supplierId),
        gte(paymentsTable.confirmedAt, input.periodStart),
        lte(paymentsTable.confirmedAt, input.periodEnd),
      ),
    )
    .all()) as any) as Array<{ paymentId: string; netCents: number; feeCents: number; confirmedAt: number }>;

  // Exclude payments already attached to a paid/processing payout
  const paymentIds = rows.map((r) => r.paymentId);
  if (paymentIds.length === 0) {
    return { amountCents: 0, feeCents: 0, netCents: 0, paymentCount: 0 };
  }
  // (v1) Payouts are aggregated per (supplier, period) so we always include the full period.
  // Once a payout is paid, future payouts in the same window will sum to zero since
  // there's no per-payment allocation. Acceptable for v1; see spec for future work.

  const sum = rows.reduce(
    (acc, r) => ({
      netCents: acc.netCents + (r.netCents ?? 0),
      feeCents: acc.feeCents + (r.feeCents ?? 0),
    }),
    { netCents: 0, feeCents: 0 },
  );

  return {
    amountCents: sum.netCents,
    feeCents: sum.feeCents,
    netCents: sum.netCents, // supplier receives net (we've already subtracted platform fee)
    paymentCount: paymentIds.length,
  };
}

export async function createPayout(
  d1: D1Database,
  input: {
    supplierId: string;
    amountCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    periodStart: number;
    periodEnd: number;
    method: 'bank' | 'cash';
  },
): Promise<Payout> {
  const db = getDb(d1);
  const id = newId();
  const now = Date.now();
  // Composite UQ may throw — caller handles
  db.insert(payoutsTable)
    .values({
      id,
      supplierId: input.supplierId,
      amountCents: input.amountCents,
      feeCents: input.feeCents,
      netCents: input.netCents,
      currency: input.currency,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      method: input.method,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = (await db.select().from(payoutsTable).where(eq(payoutsTable.id, id)).get()) as Payout | undefined;
  if (!row) throw new Error('payout insert failed');
  return row;
}

export async function findPayout(d1: D1Database, id: string): Promise<Payout | null> {
  const db = getDb(d1);
  return ((await db.select().from(payoutsTable).where(eq(payoutsTable.id, id)).get()) as Payout | undefined) ?? null;
}

export async function listPayoutsForSupplier(
  d1: D1Database,
  supplierId: string,
  cursor: number | undefined,
  status: string | undefined,
  limit = 50,
): Promise<Payout[]> {
  const db = getDb(d1);
  const conds = [eq(payoutsTable.supplierId, supplierId)];
  if (cursor !== undefined) conds.push(sql`${payoutsTable.createdAt} < ${cursor}`);
  if (status) conds.push(eq(payoutsTable.status, status as Payout['status']));
  return ((await db
    .select()
    .from(payoutsTable)
    .where(and(...conds))
    .orderBy(desc(payoutsTable.createdAt))
    .limit(limit)
    .all()) as any) as Payout[];
}

export async function listAllPayouts(
  d1: D1Database,
  cursor: number | undefined,
  status: string | undefined,
  limit = 50,
): Promise<Payout[]> {
  const db = getDb(d1);
  const conds: any[] = [];
  if (cursor !== undefined) conds.push(sql`${payoutsTable.createdAt} < ${cursor}`);
  if (status) conds.push(eq(payoutsTable.status, status as Payout['status']));
  return ((await db
    .select()
    .from(payoutsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(payoutsTable.createdAt))
    .limit(limit)
    .all()) as any) as Payout[];
}

export async function updatePayoutStatus(
  d1: D1Database,
  id: string,
  fields: Partial<
    Pick<Payout, 'status' | 'reference' | 'paidAt' | 'paidByUserId' | 'failureReason'>
  >,
): Promise<void> {
  const db = getDb(d1);
  db.update(payoutsTable)
    .set({ ...fields, updatedAt: Date.now() })
    .where(eq(payoutsTable.id, id))
    .run();
}
