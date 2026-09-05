import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';

export async function findDisputedPo(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
}

export async function setPoStatus(d1: D1Database, id: string, status: string) {
  const db = getDb(d1);
  await db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, id)).run();
}

export async function listDisputed(d1: D1Database) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.status, 'disputed')).all();
}
