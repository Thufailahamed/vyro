import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  carts,
  cartItems,
  businesses,
  supplierProducts,
  products,
  suppliers,
  purchaseOrders,
} from '@vyro/db/schema';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';
import type { CheckoutInput } from '@vyro/validation/cart';
import {
  insertOrderEvent,
  insertPo,
  insertPoItem,
  updatePoStatus,
} from './repository';
import type { TransitionInput } from './repository';
import { canTransition, OrderStatus } from '@vyro/shared';
import { recordAudit } from '../supplierProducts/repository';
import { resolveTier, applyTier, type TierSet } from '../cart/pricing';

function tsForStatus(to: string): Record<string, number> {
  const now = Date.now();
  const map: Record<string, string> = {
    accepted: 'acceptedAt',
    rejected: 'rejectedAt',
    preparing: 'preparedAt',
    ready_for_pickup: 'readyAt',
    out_for_delivery: 'dispatchedAt',
    delivered: 'deliveredAt',
    completed: 'completedAt',
    cancelled: 'cancelledAt',
  };
  return map[to] ? { [map[to]!]: now } : {};
}

async function nextPoNumber(d1: D1Database, businessId: string): Promise<string> {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  // Cheap uniqueness: timestamp + uuid-tail.
  return `PO-${yyyymmdd}-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`;
}

export const checkoutService = {
  async checkout(d1: D1Database, userId: string, input: CheckoutInput) {
    const db = getDb(d1);
    const business = await db.select().from(businesses).where(eq(businesses.id, input.businessId)).get();
    if (!business) throw httpError(404, 'NOT_FOUND', 'Business not found');

    const cart = await db
      .select()
      .from(carts)
      .where(and(eq(carts.businessId, input.businessId), eq(carts.status, 'open')))
      .get();
    if (!cart) throw httpError(400, 'VALIDATION_ERROR', 'No open cart');
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id)).all();
    if (items.length === 0) throw httpError(400, 'VALIDATION_ERROR', 'Cart is empty');

    const spIds = items.map((i) => i.supplierProductId);
    const offers = await db
      .select({ sp: supplierProducts, product: products, supplier: suppliers })
      .from(supplierProducts)
      .innerJoin(products, eq(supplierProducts.productId, products.id))
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(inArray(supplierProducts.id, spIds))
      .all();

    const map = new Map(offers.map((o) => [o.sp.id, o]));
    const groups = new Map<string, typeof offers>();
    for (const it of items) {
      const o = map.get(it.supplierProductId);
      if (!o || o.sp.deletedAt || !o.sp.active) {
        throw httpError(409, 'CONFLICT', 'Cart item no longer available');
      }
      const list = groups.get(o.sp.supplierId) ?? [];
      list.push(o);
      groups.set(o.sp.supplierId, list);
    }

    const created: string[] = [];
    const now = Date.now();
    for (const [supplierId] of groups) {
      const poId = newId();
      const poNumber = await nextPoNumber(d1, input.businessId);
      let subtotal = 0;
      const poItemsRaw = items.filter((i) => map.get(i.supplierProductId)?.sp.supplierId === supplierId);
      const lineRows: Array<Parameters<typeof insertPoItem>[1]> = [];
      for (const i of poItemsRaw) {
        const o = map.get(i.supplierProductId);
        if (!o) continue;
        const tierSet: TierSet = {
          tier1MinQty: o.sp.tier1MinQty, tier1DiscountPct: o.sp.tier1DiscountPct,
          tier2MinQty: o.sp.tier2MinQty, tier2DiscountPct: o.sp.tier2DiscountPct,
          tier3MinQty: o.sp.tier3MinQty, tier3DiscountPct: o.sp.tier3DiscountPct,
        };
        const tier = resolveTier(tierSet, i.quantity);
        const lineTotal = applyTier(o.sp.priceCents, i.quantity, tier);
        subtotal += lineTotal;
        lineRows.push({
          id: newId(),
          purchaseOrderId: poId,
          supplierProductId: o.sp.id,
          productNameSnapshot: o.product.name,
          unitPriceCents: o.sp.priceCents,
          unitPriceCentsSnapshot: o.sp.priceCents,
          discountPctSnapshot: tier?.discountPct ?? 0,
          quantity: i.quantity,
          lineTotalCents: lineTotal,
        });
      }
      await insertPo(d1, {
        id: poId,
        poNumber,
        businessId: business.id,
        supplierId,
        status: 'pending',
        subtotalCents: subtotal,
        deliveryFeeCents: 0,
        totalCents: subtotal,
        currency: 'LKR',
        deliveryAddress: business.address,
        deliveryCity: business.city,
        deliveryDistrict: business.district,
        notes: input.notes ?? null,
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
      for (const row of lineRows) await insertPoItem(d1, row);
      await insertOrderEvent(d1, {
        purchaseOrderId: poId,
        actorUserId: userId,
        fromStatus: null,
        toStatus: 'pending',
        reason: 'checkout',
        metadata: { poNumber },
      });
      created.push(poId);
    }

    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.update(carts).set({ status: 'converted', updatedAt: Date.now() }).where(eq(carts.id, cart.id));
    await recordAudit(d1, {
      actorUserId: userId,
      action: 'cart.checkout',
      resourceType: 'business',
      resourceId: business.id,
      metadata: { poIds: created },
    });

    return { poIds: created, count: created.length };
  },

  async transition(d1: D1Database, input: TransitionInput) {
    const db = getDb(d1);
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).get();
    if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
    if (!canTransition(po.status as OrderStatus, input.to, input.actor.role)) {
      throw httpError(409, 'CONFLICT', `Illegal transition ${po.status} -> ${input.to} for ${input.actor.role}`);
    }
    await updatePoStatus(d1, po.id, input.to, tsForStatus(input.to));
    await insertOrderEvent(d1, {
      purchaseOrderId: po.id,
      actorUserId: input.actor.userId,
      fromStatus: po.status,
      toStatus: input.to,
      reason: input.reason ?? null,
      metadata: null,
    });
    await recordAudit(d1, {
      actorUserId: input.actor.userId,
      action: `po.${input.to}`,
      resourceType: 'purchase_order',
      resourceId: po.id,
      metadata: { from: po.status, to: input.to, reason: input.reason ?? null },
    });
    return { ok: true };
  },
};
