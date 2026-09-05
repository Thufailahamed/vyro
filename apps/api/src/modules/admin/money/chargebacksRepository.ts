import { getDb } from '@vyro/db';
import { chargebacks } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';

export type ChargebackRow = {
  id: string;
  paymentId: string;
  reason: string;
  status: 'open' | 'resolved' | 'cancelled';
  resolvedBy: string | null;
  resolvedAt: number | null;
  refundId: string | null;
  notes: string | null;
  createdAt: number;
};

export async function listOpen(d1: D1Database): Promise<ChargebackRow[]> {
  const db = getDb(d1);
  return (await db
    .select()
    .from(chargebacks)
    .where(eq(chargebacks.status, 'open'))
    .all()) as ChargebackRow[];
}

export async function getChargeback(d1: D1Database, id: string): Promise<ChargebackRow | null> {
  const db = getDb(d1);
  const row = (await db.select().from(chargebacks).where(eq(chargebacks.id, id)).get()) as
    | ChargebackRow
    | undefined;
  return row ?? null;
}

export async function resolveChargeback(
  d1: D1Database,
  id: string,
  resolvedBy: string,
  notes: string | null,
  refundId: string | null,
): Promise<{ before: ChargebackRow; after: ChargebackRow } | null> {
  const before = await getChargeback(d1, id);
  if (!before) return null;
  await db_update(d1, id, resolvedBy, notes, refundId);
  return {
    before,
    after: { ...before, status: 'resolved', resolvedBy, resolvedAt: Date.now(), notes, refundId },
  };
}

async function db_update(
  d1: D1Database,
  id: string,
  resolvedBy: string,
  notes: string | null,
  refundId: string | null,
) {
  const db = getDb(d1);
  await db
    .update(chargebacks)
    .set({ status: 'resolved', resolvedBy, resolvedAt: Date.now(), notes, refundId })
    .where(eq(chargebacks.id, id))
    .run();
}
