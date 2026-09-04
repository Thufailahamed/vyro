import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { deliveries } from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import type { DeliveryStatus } from '@vyro/validation/delivery';

export async function findDeliveryByPo(d1: D1Database, poId: string) {
  const db = getDb(d1);
  return (await db.select().from(deliveries).where(eq(deliveries.purchaseOrderId, poId)).get()) ?? null;
}

export async function ensureDelivery(d1: D1Database, poId: string) {
  const existing = await findDeliveryByPo(d1, poId);
  if (existing) return existing;
  const id = newId();
  const now = Date.now();
  const db = getDb(d1);
  await db.insert(deliveries).values({
    id,
    purchaseOrderId: poId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  return (await findDeliveryByPo(d1, poId))!;
}

export async function updateDelivery(
  d1: D1Database,
  poId: string,
  patch: {
    status?: DeliveryStatus;
    driverName?: string | null;
    driverPhone?: string | null;
    estimatedAt?: number | null;
    pickedUpAt?: number;
    deliveredAt?: number;
    assignedByUserId?: string;
  },
) {
  const db = getDb(d1);
  await db.update(deliveries).set({ ...patch, updatedAt: Date.now() }).where(eq(deliveries.purchaseOrderId, poId));
}
