import { Hono } from 'hono';
import { addCartItemSchema, updateCartItemSchema } from '@vyro/validation/cart';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { businessMembers, supplierProducts, products, suppliers, carts, cartItems, productImages } from '@vyro/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  clearCart,
  deleteCartItem,
  ensureOpenCart,
  findCartItem,
  listCartItems,
  upsertCartItem,
} from './repository';

const router = new Hono<{ Bindings: Env }>();

async function requireBusinessMember(d1: D1Database, businessId: string, userId: string, allow: Array<'owner' | 'manager' | 'staff'>) {
  const db = getDb(d1);
  const row = await db
    .select()
    .from(businessMembers)
    .where(sql`${businessMembers.businessId} = ${businessId} and ${businessMembers.userId} = ${userId}`)
    .get();
  if (!row || !allow.includes(row.role as any)) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient role for business');
  }
}

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await requireBusinessMember(c.env.DB, businessId, ctx.userId, ['owner', 'manager', 'staff']);

  const cart = await ensureOpenCart(c.env.DB, businessId);
  const items = await listCartItems(c.env.DB, cart.id);

  let enriched: any[] = [];
  if (items.length) {
    const db = getDb(c.env.DB);
    const spIds = items.map((i) => i.supplierProductId);
    const offers = await db
      .select({
        sp: supplierProducts,
        product: products,
        supplier: suppliers,
      })
      .from(supplierProducts)
      .innerJoin(products, eq(supplierProducts.productId, products.id))
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(inArray(supplierProducts.id, spIds))
      .all();
    const map = new Map(offers.map((o) => [o.sp.id, o]));
    const pIds = [...new Set(offers.map((o) => o.product.id))];
    const imageMap = new Map<string, string>();
    if (pIds.length) {
      const imgs = await db
        .select()
        .from(productImages)
        .where(sql`${productImages.productId} in (${sql.join(pIds.map((id) => sql`${id}`), sql.raw(','))})`)
        .orderBy(productImages.sortOrder)
        .all();
      for (const img of imgs) {
        if (!imageMap.has(img.productId)) {
          const url = img.r2Key.startsWith('http://') || img.r2Key.startsWith('https://')
            ? img.r2Key
            : `/api/products/images/${img.r2Key}`;
          imageMap.set(img.productId, url);
        }
      }
    }
    enriched = items.map((i) => {
      const o = map.get(i.supplierProductId);
      return o
        ? {
            id: i.id,
            quantity: i.quantity,
            priceCents: o.sp.priceCents,
            lineTotalCents: o.sp.priceCents * i.quantity,
            product: {
              ...o.product,
              imageUrl: imageMap.get(o.product.id) ?? null,
            },
            supplier: o.supplier,
            offer: { id: o.sp.id, minOrderQty: o.sp.minOrderQty, leadTimeDays: o.sp.leadTimeDays, availabilityStatus: o.sp.availabilityStatus },
          }
        : null;
    }).filter(Boolean);
  }

  const subtotal = enriched.reduce((s, e) => s + e.lineTotalCents, 0);
  const supplierIds = new Set(enriched.map((e) => e!.supplier.id));
  return c.json({ cart: { id: cart.id, status: cart.status }, items: enriched, subtotalCents: subtotal, supplierCount: supplierIds.size });
});

router.post('/items', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = addCartItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  await requireBusinessMember(c.env.DB, parsed.data.businessId, ctx.userId, ['owner', 'manager', 'staff']);

  const db = getDb(c.env.DB);
  const offer = await db.select().from(supplierProducts).where(eq(supplierProducts.id, parsed.data.supplierProductId)).get();
  if (!offer || offer.deletedAt) throw httpError(404, 'NOT_FOUND', 'Offer not found');
  if (!offer.active) throw httpError(409, 'CONFLICT', 'Offer inactive');

  const cart = await ensureOpenCart(c.env.DB, parsed.data.businessId);
  const id = await upsertCartItem(c.env.DB, cart.id, parsed.data.supplierProductId, parsed.data.quantity);
  return c.json({ id }, 201);
});

router.patch('/items/:itemId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const itemId = c.req.param('itemId');
  const parsed = updateCartItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const db = getDb(c.env.DB);
  const item = await db.select().from(cartItems).where(eq(cartItems.id, itemId)).get();
  if (!item) throw httpError(404, 'NOT_FOUND', 'Cart item not found');
  const cart = await db.select().from(carts).where(eq(carts.id, item.cartId)).get();
  if (!cart) throw httpError(404, 'NOT_FOUND', 'Cart not found');
  await requireBusinessMember(c.env.DB, cart.businessId, ctx.userId, ['owner', 'manager', 'staff']);

  await upsertCartItem(c.env.DB, cart.id, item.supplierProductId, parsed.data.quantity);
  return c.json({ ok: true });
});

router.delete('/items/:itemId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const itemId = c.req.param('itemId');
  const db = getDb(c.env.DB);
  const item = await db.select().from(cartItems).where(eq(cartItems.id, itemId)).get();
  if (!item) throw httpError(404, 'NOT_FOUND', 'Cart item not found');
  const cart = await db.select().from(carts).where(eq(carts.id, item.cartId)).get();
  if (!cart) throw httpError(404, 'NOT_FOUND', 'Cart not found');
  await requireBusinessMember(c.env.DB, cart.businessId, ctx.userId, ['owner', 'manager', 'staff']);

  await deleteCartItem(c.env.DB, item.id);
  return c.json({ ok: true });
});

void requireRole;
void findCartItem;
void clearCart;

export default router;
