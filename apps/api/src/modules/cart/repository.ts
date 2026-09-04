import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { carts, cartItems } from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export async function findOpenCartByBusiness(d1: D1Database, businessId: string) {
  const db = getDb(d1);
  return (
    (await db.select().from(carts).where(and(eq(carts.businessId, businessId), eq(carts.status, 'open'))).get()) ??
    null
  );
}

export async function createOpenCart(d1: D1Database, businessId: string) {
  const db = getDb(d1);
  const id = newId();
  const now = Date.now();
  await db.insert(carts).values({ id, businessId, status: 'open', createdAt: now, updatedAt: now });
  return id;
}

export async function ensureOpenCart(d1: D1Database, businessId: string) {
  const existing = await findOpenCartByBusiness(d1, businessId);
  if (existing) return existing;
  const id = await createOpenCart(d1, businessId);
  return (await getDb(d1).select().from(carts).where(eq(carts.id, id)).get())!;
}

export async function listCartItems(d1: D1Database, cartId: string) {
  const db = getDb(d1);
  return db.select().from(cartItems).where(eq(cartItems.cartId, cartId)).all();
}

export async function findCartItem(d1: D1Database, cartId: string, supplierProductId: string) {
  const db = getDb(d1);
  return (
    (await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.supplierProductId, supplierProductId)))
      .get()) ?? null
  );
}

export async function upsertCartItem(d1: D1Database, cartId: string, supplierProductId: string, quantity: number) {
  const db = getDb(d1);
  const existing = await findCartItem(d1, cartId, supplierProductId);
  if (existing) {
    await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, existing.id));
    return existing.id;
  }
  const id = newId();
  await db.insert(cartItems).values({ id, cartId, supplierProductId, quantity });
  return id;
}

export async function deleteCartItem(d1: D1Database, itemId: string) {
  const db = getDb(d1);
  await db.delete(cartItems).where(eq(cartItems.id, itemId));
}

export async function clearCart(d1: D1Database, cartId: string) {
  const db = getDb(d1);
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  await db.update(carts).set({ status: 'converted', updatedAt: Date.now() }).where(eq(carts.id, cartId));
}
