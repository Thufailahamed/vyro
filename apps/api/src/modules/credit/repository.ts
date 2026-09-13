import { getDb } from '@vyro/db';
import { creditDrawdowns, creditFacilities, payments, purchaseOrders } from '@vyro/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { CREDIT_DEFAULT_LIMIT_CENTS, CREDIT_MIN_PAID_ORDERS } from './service';

export async function getFacility(d1: D1Database, businessId: string) {
  const db = getDb(d1);
  return (await db.select().from(creditFacilities).where(eq(creditFacilities.businessId, businessId)).get()) as any;
}

export async function listDrawdowns(d1: D1Database, businessId: string, status?: 'active' | 'repaid' | 'overdue') {
  const db = getDb(d1);
  const cond = status
    ? and(eq(creditDrawdowns.businessId, businessId), eq(creditDrawdowns.status, status as never))
    : eq(creditDrawdowns.businessId, businessId);
  return (await db.select().from(creditDrawdowns).where(cond).orderBy(desc(creditDrawdowns.dueAt)).all()) as any[];
}

export async function countOverdue(d1: D1Database, businessId: string): Promise<number> {
  const db = getDb(d1);
  const row = (await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(creditDrawdowns)
    .where(and(eq(creditDrawdowns.businessId, businessId), eq(creditDrawdowns.status, 'overdue' as never)))
    .get()) as any;
  return Number(row?.n ?? 0);
}

export async function countPaidOrders(d1: D1Database, businessId: string): Promise<number> {
  const db = getDb(d1);
  const row = (await db
    .select({ n: sql<number>`COUNT(DISTINCT ${purchaseOrders.id})` })
    .from(purchaseOrders)
    .innerJoin(payments, eq(payments.purchaseOrderId, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrders.businessId, businessId),
        sql`${purchaseOrders.status} IN ('delivered', 'completed')`,
        sql`${payments.status} IN ('paid', 'confirmed')`,
      ),
    )
    .get()) as any;
  return Number(row?.n ?? 0);
}

export async function ensureAutoFacility(d1: D1Database, businessId: string, now: number) {
  const db = getDb(d1);
  const existing = await getFacility(d1, businessId);
  if (existing) return existing;
  if ((await countOverdue(d1, businessId)) > 0) return null;
  if ((await countPaidOrders(d1, businessId)) < CREDIT_MIN_PAID_ORDERS) return null;
  const row = {
    businessId,
    limitCents: CREDIT_DEFAULT_LIMIT_CENTS,
    usedCents: 0,
    status: 'active' as const,
    defaultTerms: 'net30' as const,
    autoGranted: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(creditFacilities).values(row).run();
  return row;
}
