import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  refunds as refundsTable,
  payments as paymentsTable,
  type Refund,
  type Payment,
} from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export type CreateRefundInput = {
  paymentId: string;
  amountCents: number;
  reason?: string | null;
  requestedByUserId: string;
};

export async function createRefund(
  d1: D1Database,
  input: CreateRefundInput,
): Promise<Refund> {
  const db = getDb(d1);
  const id = newId();
  const now = Date.now();
  db.insert(refundsTable)
    .values({
      id,
      paymentId: input.paymentId,
      amountCents: input.amountCents,
      reason: input.reason ?? null,
      status: 'requested',
      requestedByUserId: input.requestedByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = (await db.select().from(refundsTable).where(eq(refundsTable.id, id)).get()) as Refund | undefined;
  if (!row) throw new Error('refund insert failed');
  return row;
}

export async function findRefund(d1: D1Database, id: string): Promise<Refund | null> {
  const db = getDb(d1);
  return ((await db.select().from(refundsTable).where(eq(refundsTable.id, id)).get()) as Refund | undefined) ?? null;
}

export async function sumCompletedRefundsForPayment(d1: D1Database, paymentId: string): Promise<number> {
  const db = getDb(d1);
  const row = (await db
    .select({ sum: sql<number>`COALESCE(SUM(amount_cents), 0)` })
    .from(refundsTable)
    .where(and(eq(refundsTable.paymentId, paymentId), eq(refundsTable.status, 'completed')))
    .get()) as any;
  return Number(row?.sum ?? 0);
}

export async function listRefundsForPayment(d1: D1Database, paymentId: string): Promise<Refund[]> {
  const db = getDb(d1);
  return ((await db
    .select()
    .from(refundsTable)
    .where(eq(refundsTable.paymentId, paymentId))
    .orderBy(desc(refundsTable.createdAt))
    .all()) as any) as Refund[];
}

export async function updateRefundStatus(
  d1: D1Database,
  id: string,
  status: Refund['status'],
  fields: Partial<Pick<Refund, 'gatewayRefundId' | 'failureReason' | 'processedAt'>>,
): Promise<void> {
  const db = getDb(d1);
  db.update(refundsTable)
    .set({
      status,
      gatewayRefundId: fields.gatewayRefundId ?? null,
      failureReason: fields.failureReason ?? null,
      processedAt: fields.processedAt ?? null,
      updatedAt: Date.now(),
    })
    .where(eq(refundsTable.id, id))
    .run();
}

export type { Payment, Refund };
export { paymentsTable, refundsTable };
