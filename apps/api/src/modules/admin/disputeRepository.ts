import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders, orderEvents } from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export async function findDisputedPo(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
}

export async function setPoStatus(d1: D1Database, id: string, status: string, actorUserId?: string, reason?: string | null) {
  const db = getDb(d1);
  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get()) as any;
  const now = Date.now();
  const tsPatch: Record<string, number> =
    status === 'cancelled' ? { cancelledAt: now } : status === 'delivered' ? { deliveredAt: now } : {};
  await db.update(purchaseOrders).set({ status, updatedAt: now, ...tsPatch } as any).where(eq(purchaseOrders.id, id)).run();
  await db.insert(orderEvents).values({
    id: newId(),
    purchaseOrderId: id,
    actorUserId: actorUserId ?? null,
    fromStatus: po?.status ?? 'disputed',
    toStatus: status,
    reason: reason ?? 'dispute resolved',
    metadata: null,
    createdAt: now,
  }).run();
}

export async function listDisputed(d1: D1Database) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.status, 'disputed')).all();
}
