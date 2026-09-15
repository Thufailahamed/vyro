import { and, eq, gte, sum } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';

export const repeatOffersRepository = {
  async trailingSpendForBusiness(
    d1: D1Database,
    businessId: string,
    now: number,
    windowMs: number,
  ): Promise<Map<string, number>> {
    const db = getDb(d1);
    const since = now - windowMs;
    const rows = await db
      .select({
        supplierId: purchaseOrders.supplierId,
        totalCents: sum(purchaseOrders.subtotalCents),
      })
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.businessId, businessId),
        eq(purchaseOrders.status, 'completed'),
        gte(purchaseOrders.completedAt, since),
      ))
      .groupBy(purchaseOrders.supplierId);

    const out = new Map<string, number>();
    for (const r of rows) {
      const cents = Number(r.totalCents ?? 0);
      if (cents > 0) out.set(r.supplierId, cents);
    }
    return out;
  },
};
