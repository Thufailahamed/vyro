import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';

// Status writes for dispute resolution live in orders/lifecycle.ts (applyTransition
// with `disputeResolution`); this module is read-only.

export async function findDisputedPo(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
}

export async function listDisputed(d1: D1Database) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.status, 'disputed')).all();
}
