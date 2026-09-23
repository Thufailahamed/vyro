import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  orderLists,
  orderListItems,
  supplierProducts,
  products,
  suppliers,
  productImages,
  purchaseOrders,
  purchaseOrderItems,
  type OrderList,
} from '@vyro/db/schema';
import { availableQty, checkPurchasable, deriveAvailability, newId } from '@vyro/shared';
import { httpError } from '../../lib/errors';
import { ensureOpenCart, upsertCartItem } from '../cart/repository';

export const MAX_LISTS_PER_BUSINESS = 50;
export const MAX_ITEMS_PER_LIST = 200;

export async function findList(d1: D1Database, id: string): Promise<OrderList | null> {
  return (await getDb(d1).select().from(orderLists).where(eq(orderLists.id, id)).get()) ?? null;
}

export async function listListsForBusiness(d1: D1Database, businessId: string) {
  const db = getDb(d1);
  const lists = await db
    .select({
      id: orderLists.id,
      name: orderLists.name,
      createdAt: orderLists.createdAt,
      updatedAt: orderLists.updatedAt,
      itemCount: sql<number>`(select count(*) from order_list_items oli where oli.list_id = ${orderLists.id})`,
    })
    .from(orderLists)
    .where(eq(orderLists.businessId, businessId))
    .orderBy(desc(orderLists.updatedAt))
    .all();
  return lists.map((l) => ({ ...l, itemCount: Number(l.itemCount ?? 0) }));
}

async function touch(d1: D1Database, listId: string) {
  await getDb(d1).update(orderLists).set({ updatedAt: Date.now() }).where(eq(orderLists.id, listId)).run();
}

export async function createList(
  d1: D1Database,
  input: { businessId: string; name: string; userId: string; fromPurchaseOrderId?: string | undefined },
): Promise<OrderList> {
  const db = getDb(d1);
  const count = (await listListsForBusiness(d1, input.businessId)).length;
  if (count >= MAX_LISTS_PER_BUSINESS) {
    throw httpError(409, 'CONFLICT', `You can keep up to ${MAX_LISTS_PER_BUSINESS} order lists.`);
  }
  let seed: Array<{ supplierProductId: string; quantity: number }> = [];
  if (input.fromPurchaseOrderId) {
    const po = await db
      .select({ id: purchaseOrders.id, businessId: purchaseOrders.businessId })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, input.fromPurchaseOrderId))
      .get();
    // Same 404 for "missing" and "someone else's order" — no tenant probing.
    if (!po || po.businessId !== input.businessId) throw httpError(404, 'NOT_FOUND', 'Order not found');
    const lines = await db
      .select({ supplierProductId: purchaseOrderItems.supplierProductId, quantity: purchaseOrderItems.quantity })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, po.id))
      .all();
    const merged = new Map<string, number>();
    for (const l of lines) merged.set(l.supplierProductId, (merged.get(l.supplierProductId) ?? 0) + l.quantity);
    seed = [...merged].map(([supplierProductId, quantity]) => ({ supplierProductId, quantity }));
  }
  const now = Date.now();
  const list: OrderList = {
    id: newId(),
    businessId: input.businessId,
    name: input.name,
    createdByUserId: input.userId,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(orderLists).values(list).run();
  for (const s of seed.slice(0, MAX_ITEMS_PER_LIST)) {
    await db
      .insert(orderListItems)
      .values({ id: newId(), listId: list.id, supplierProductId: s.supplierProductId, quantity: s.quantity, createdAt: now })
      .run();
  }
  return list;
}

export async function renameList(d1: D1Database, listId: string, name: string) {
  await getDb(d1).update(orderLists).set({ name, updatedAt: Date.now() }).where(eq(orderLists.id, listId)).run();
}

export async function deleteList(d1: D1Database, listId: string) {
  const db = getDb(d1);
  await db.delete(orderListItems).where(eq(orderListItems.listId, listId)).run();
  await db.delete(orderLists).where(eq(orderLists.id, listId)).run();
}

export async function upsertListItem(
  d1: D1Database,
  listId: string,
  supplierProductId: string,
  quantity: number,
) {
  const db = getDb(d1);
  const offer = await db.select().from(supplierProducts).where(eq(supplierProducts.id, supplierProductId)).get();
  if (!offer || offer.deletedAt) throw httpError(404, 'NOT_FOUND', 'Offer not found');
  const existing = await db
    .select()
    .from(orderListItems)
    .where(and(eq(orderListItems.listId, listId), eq(orderListItems.supplierProductId, supplierProductId)))
    .get();
  if (existing) {
    await db.update(orderListItems).set({ quantity }).where(eq(orderListItems.id, existing.id)).run();
  } else {
    const n = await db
      .select({ n: sql<number>`count(*)` })
      .from(orderListItems)
      .where(eq(orderListItems.listId, listId))
      .get();
    if (Number(n?.n ?? 0) >= MAX_ITEMS_PER_LIST) {
      throw httpError(409, 'CONFLICT', `A list can hold up to ${MAX_ITEMS_PER_LIST} items.`);
    }
    await db
      .insert(orderListItems)
      .values({ id: newId(), listId, supplierProductId, quantity, createdAt: Date.now() })
      .run();
  }
  await touch(d1, listId);
}

export async function removeListItem(d1: D1Database, listId: string, itemId: string): Promise<boolean> {
  const db = getDb(d1);
  const row = await db
    .select({ id: orderListItems.id })
    .from(orderListItems)
    .where(and(eq(orderListItems.id, itemId), eq(orderListItems.listId, listId)))
    .get();
  if (!row) return false;
  await db.delete(orderListItems).where(eq(orderListItems.id, itemId)).run();
  await touch(d1, listId);
  return true;
}

/** List items joined with live offer, product, supplier and a thumbnail. */
export async function listItemsDetailed(d1: D1Database, listId: string) {
  const db = getDb(d1);
  const rows = await db
    .select({ item: orderListItems, sp: supplierProducts, product: products, supplier: suppliers })
    .from(orderListItems)
    .innerJoin(supplierProducts, eq(orderListItems.supplierProductId, supplierProducts.id))
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
    .where(eq(orderListItems.listId, listId))
    .orderBy(asc(suppliers.name), asc(products.name))
    .all();
  const productIds = [...new Set(rows.map((r) => r.product.id))];
  const images = new Map<string, string>();
  if (productIds.length) {
    const imgs = await db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(productImages.sortOrder)
      .all();
    for (const img of imgs) {
      if (images.has(img.productId)) continue;
      images.set(
        img.productId,
        /^https?:\/\//.test(img.r2Key) ? img.r2Key : `/api/products/images/${img.r2Key}`,
      );
    }
  }
  return rows.map(({ item, sp, product, supplier }) => {
    const purchasable = !sp.deletedAt && sp.active;
    return {
      id: item.id,
      quantity: item.quantity,
      supplierProductId: sp.id,
      priceCents: sp.priceCents,
      minOrderQty: sp.minOrderQty,
      lineEstimateCents: sp.priceCents * item.quantity,
      purchasable,
      availabilityStatus: purchasable ? deriveAvailability(sp) : 'out_of_stock',
      availableQty: sp.trackInventory ? availableQty(sp) : null,
      product: {
        id: product.id,
        name: product.name,
        unit: product.unit,
        packSize: product.packSize,
        imageUrl: images.get(product.id) ?? null,
      },
      supplier: { id: supplier.id, name: supplier.name },
    };
  });
}

export type AddToCartSkipReason = 'unavailable' | 'out_of_stock' | 'insufficient_stock';

/**
 * Puts every list line into the open cart. Quantities below MOQ are raised to
 * the MOQ (a list saved before the supplier changed MOQ still works); lines
 * that are archived or can't be fulfilled are reported, never silently dropped.
 */
export async function addListToCart(d1: D1Database, listId: string, businessId: string) {
  const db = getDb(d1);
  const rows = await db
    .select({ item: orderListItems, sp: supplierProducts, productName: products.name })
    .from(orderListItems)
    .innerJoin(supplierProducts, eq(orderListItems.supplierProductId, supplierProducts.id))
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .where(eq(orderListItems.listId, listId))
    .all();
  const cart = await ensureOpenCart(d1, businessId);
  const added: Array<{ supplierProductId: string; name: string; quantity: number; raisedToMoq: boolean }> = [];
  const skipped: Array<{ supplierProductId: string; name: string; reason: AddToCartSkipReason; message: string }> = [];
  for (const { item, sp, productName } of rows) {
    if (sp.deletedAt || !sp.active) {
      skipped.push({ supplierProductId: sp.id, name: productName, reason: 'unavailable', message: 'No longer sold by this supplier' });
      continue;
    }
    const quantity = Math.max(item.quantity, sp.minOrderQty);
    const verdict = checkPurchasable(sp, quantity);
    if (!verdict.ok) {
      skipped.push({
        supplierProductId: sp.id,
        name: productName,
        reason: verdict.code === 'INSUFFICIENT_STOCK' ? 'insufficient_stock' : 'out_of_stock',
        message: verdict.message,
      });
      continue;
    }
    await upsertCartItem(d1, cart.id, sp.id, quantity);
    added.push({ supplierProductId: sp.id, name: productName, quantity, raisedToMoq: quantity > item.quantity });
  }
  return { cartId: cart.id, addedCount: added.length, skippedCount: skipped.length, added, skipped };
}
