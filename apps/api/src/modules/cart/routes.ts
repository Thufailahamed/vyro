import { Hono } from 'hono';
import { addCartItemSchema, updateCartItemSchema } from '@vyro/validation/cart';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { supplierProducts, products, suppliers, carts, cartItems, productImages } from '@vyro/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { requireBusinessRole } from '@vyro/auth';
import {
  clearCart,
  deleteCartItem,
  ensureOpenCart,
  findCartItem,
  listCartItems,
  upsertCartItem,
} from './repository';
import { resolveTier, nextTier, applyTier, discountCents, type TierSet } from './pricing';
import { availableQty, checkPurchasable, deriveAvailability } from '@vyro/shared';

const router = new Hono<{ Bindings: Env }>();

const CART_ROLES = ['owner', 'manager', 'staff'] as const;

/**
 * Server-side purchasability gate. The buyer UI mirrors this with
 * `checkPurchasable` from @vyro/shared, but the server is authoritative so a
 * direct API call cannot order out-of-stock or below-MOQ quantities.
 */
function assertPurchasable(
  offer: {
    minOrderQty: number;
    stockQty: number;
    reservedQty: number;
    lowStockThreshold: number;
    trackInventory: boolean;
    availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  },
  quantity: number,
): void {
  const verdict = checkPurchasable(offer, quantity);
  if (!verdict.ok) {
    throw httpError(409, verdict.code, verdict.message, {
      ...(verdict.code === 'BELOW_MOQ' ? { minOrderQty: verdict.minOrderQty } : {}),
      ...(verdict.code === 'INSUFFICIENT_STOCK' ? { available: verdict.available } : {}),
    });
  }
}

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  requireBusinessRole(ctx, businessId, CART_ROLES);

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
      if (!o) return null;
      const tierSet: TierSet = {
        tier1MinQty: o.sp.tier1MinQty, tier1DiscountPct: o.sp.tier1DiscountPct,
        tier2MinQty: o.sp.tier2MinQty, tier2DiscountPct: o.sp.tier2DiscountPct,
        tier3MinQty: o.sp.tier3MinQty, tier3DiscountPct: o.sp.tier3DiscountPct,
      };
      const best = resolveTier(tierSet, i.quantity);
      const lineTotal = applyTier(o.sp.priceCents, i.quantity, best);
      const disc = discountCents(o.sp.priceCents, i.quantity, best);
      return {
        id: i.id,
        quantity: i.quantity,
        priceCents: o.sp.priceCents,
        lineTotalCents: lineTotal,
        discountCents: disc,
        bestTier: best,
        nextTier: best ? null : nextTier(tierSet, i.quantity),
        product: {
          ...o.product,
          imageUrl: imageMap.get(o.product.id) ?? null,
        },
        supplier: o.supplier,
        offer: {
          id: o.sp.id,
          minOrderQty: o.sp.minOrderQty,
          leadTimeDays: o.sp.leadTimeDays,
          availabilityStatus: deriveAvailability(o.sp),
          trackInventory: o.sp.trackInventory,
          availableQty: o.sp.trackInventory ? availableQty(o.sp) : null,
          lowStockThreshold: o.sp.lowStockThreshold,
        },
        issues: (() => {
          const verdict = checkPurchasable(o.sp, i.quantity);
          return verdict.ok ? [] : [verdict];
        })(),
      };
    }).filter(Boolean);
  }

  const subtotalCents = enriched.reduce((s, e) => s + (e!.priceCents * e!.quantity), 0);
  const discountTotalCents = enriched.reduce((s, e) => s + e!.discountCents, 0);
  const totalCents = enriched.reduce((s, e) => s + e!.lineTotalCents, 0);
  const supplierIds = new Set(enriched.map((e) => e!.supplier.id));
  return c.json({
    cart: { id: cart.id, status: cart.status },
    items: enriched,
    subtotalCents,
    discountTotalCents,
    totalCents,
    supplierCount: supplierIds.size,
  });
});

router.post('/items', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = addCartItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  await requireBusinessRole(ctx, parsed.data.businessId, CART_ROLES);

  const db = getDb(c.env.DB);
  const offer = await db.select().from(supplierProducts).where(eq(supplierProducts.id, parsed.data.supplierProductId)).get();
  if (!offer || offer.deletedAt) throw httpError(404, 'NOT_FOUND', 'Offer not found');
  if (!offer.active) throw httpError(409, 'CONFLICT', 'Offer inactive');
  assertPurchasable(offer, parsed.data.quantity);

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
  requireBusinessRole(ctx, cart.businessId, CART_ROLES);

  const offer = await db
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.id, item.supplierProductId))
    .get();
  if (!offer || offer.deletedAt) throw httpError(404, 'NOT_FOUND', 'Offer not found');
  if (!offer.active) throw httpError(409, 'CONFLICT', 'Offer inactive');
  assertPurchasable(offer, parsed.data.quantity);

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
  requireBusinessRole(ctx, cart.businessId, CART_ROLES);

  await deleteCartItem(c.env.DB, item.id);
  return c.json({ ok: true });
});

void requireRole;
void findCartItem;
void clearCart;

export default router;
