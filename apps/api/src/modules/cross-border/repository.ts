import { orderCustomsDocs, type OrderCustomsDoc } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Db } from '@vyro/db';

export async function insertCustomsDoc(
  db: Db,
  row: Omit<OrderCustomsDoc, 'id' | 'uploadedAt'>,
): Promise<OrderCustomsDoc> {
  const id = newId();
  const [out] = await db
    .insert(orderCustomsDocs)
    .values({ ...row, id, uploadedAt: Date.now() })
    .returning();
  if (!out) throw new Error('Failed to insert customs doc');
  return out;
}

export async function listDocsForOrder(db: Db, orderId: string): Promise<OrderCustomsDoc[]> {
  return db.select().from(orderCustomsDocs).where(eq(orderCustomsDocs.orderId, orderId));
}

export async function findDoc(db: Db, id: string): Promise<OrderCustomsDoc | undefined> {
  const [row] = await db
    .select()
    .from(orderCustomsDocs)
    .where(eq(orderCustomsDocs.id, id))
    .limit(1);
  return row;
}