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
  purchaseOrderItems,
  orderEvents,
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
import {
  checkPurchasable,
  ORDER_STATUS_COPY,
  ORDER_STATUS_NOTIFICATION,
  NotificationType,
} from '@vyro/shared';
import { recordAudit } from '../supplierProducts/repository';
import { resolveTier, applyTier, type TierSet } from '../cart/pricing';
import { inventoryService } from '../inventory/service';
import { notifyOrderParties } from '../notifications/dispatcher';
import { isCrossBorderEnabled } from '../../lib/crossBorderEnv';
import { preOrderCreateCheck } from '../cross-border/service';
import { metric } from '../../lib/metrics';
import { availableCents, createDrawdownsForCheckout, dueAtForTerms, evaluateEligibility } from '../credit/service';
import { countOverdue, countPaidOrders, ensureAutoFacility, getFacility } from '../credit/repository';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { crm } from '../rfqs/crm';
import { repeatOffers } from '../repeatOffers/service';
import { REPEAT_OFFER_FLAG, REPEAT_OFFER_PERCENT } from '../repeatOffers/constants';
import type { Env } from '../../env';

interface QueueLike {
  send: (body: unknown) => Promise<unknown>;
}

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
  void businessId;
  const db = getDb(d1);
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = new Date();
    const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
    // Cheap uniqueness: timestamp + uuid-tail. Retry on collision instead of
    // surfacing a raw unique-constraint 500 to the buyer.
    const candidate = `PO-${yyyymmdd}-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    const existing = await db.select().from(purchaseOrders).where(eq(purchaseOrders.poNumber, candidate)).get();
    if (!existing) return candidate;
  }
  // Final fallback: globally unique id suffix (no collision possible).
  return `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${newId().slice(-8).toUpperCase()}`;
}

export const checkoutService = {
  async checkout(
    d1: D1Database,
    env: Env,
    userId: string,
    input: CheckoutInput,
    queue?: QueueLike,
  ) {
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
      // Availability + MOQ + stock are enforced here, not only in the UI.
      const verdict = checkPurchasable(o.sp, it.quantity);
      if (!verdict.ok) {
        throw httpError(409, verdict.code, `${o.product.name}: ${verdict.message}`, {
          supplierProductId: o.sp.id,
          ...(verdict.code === 'BELOW_MOQ' ? { minOrderQty: verdict.minOrderQty } : {}),
          ...(verdict.code === 'INSUFFICIENT_STOCK' ? { available: verdict.available } : {}),
        });
      }
      const list = groups.get(o.sp.supplierId) ?? [];
      list.push(o);
      groups.set(o.sp.supplierId, list);
    }

    const created: Array<{ poId: string; direction: 'domestic' | 'export' | 'import'; paymentMethod: 'payhere' | 'wire' }> = [];
    const now = Date.now();

    // Repeat Offers: pre-compute eligibility once. Discount applied per-PO below.
    const repeatOffersActive = await isFeatureEnabled(d1, REPEAT_OFFER_FLAG);
    const repeatOfferList = repeatOffersActive
      ? await repeatOffers.computeEligibility(d1, business.id, now)
      : [];
    const repeatOfferBySupplier = new Map(repeatOfferList.map((o) => [o.supplierId, o]));
    const repeatDiscountBySupplier = new Map<string, number>();
    /** Undo POs already written when a later supplier's stock reservation fails. */
    const rollbackCreated = async () => {
      for (const c of created) {
        try {
          await inventoryService.releaseForOrder(d1, queue, c.poId, userId, 'checkout rollback');
        } catch {
          /* ignore */
        }
        try {
          await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, c.poId));
          await db.delete(orderEvents).where(eq(orderEvents.purchaseOrderId, c.poId));
          await db.delete(purchaseOrders).where(eq(purchaseOrders.id, c.poId));
        } catch {
          /* ignore */
        }
      }
      created.length = 0;
    };

    for (const [supplierId] of groups) {
      const poId = newId();
      const poNumber = await nextPoNumber(d1, input.businessId);
      let subtotal = 0;
      const poItemsRaw = items.filter((i) => map.get(i.supplierProductId)?.sp.supplierId === supplierId);
      const lineRows: Array<Parameters<typeof insertPoItem>[1]> = [];

      // Cross-border hook: KYC gate + sanctions + restricted + FX snapshot.
      // Only runs when CROSS_BORDER_ENABLED. Without the flag, all orders
      // are forced to direction=domestic via schema default.
      let crossBorder: { direction: 'domestic' | 'export' | 'import'; fxSnapshotId: string | null } | null = null;
      if (isCrossBorderEnabled(env)) {
        const buyerCountry = (business.countryCode ?? 'LK').toUpperCase();
        const supplierCountry = (map.get(poItemsRaw[0]?.supplierProductId ?? '')?.supplier.countryCode ?? 'LK').toUpperCase();
        if (buyerCountry !== 'LK' && business.kycLevel === 'none') {
          metric(env, 'cross_border.kyc_required', 1, { buyer_country: buyerCountry });
          throw httpError(422, 'KYC_REQUIRED', 'Foreign buyers require KYC verification');
        }
        const hsCodes = poItemsRaw
          .map((i) => map.get(i.supplierProductId)?.product.hsCode)
          .filter((h): h is string => Boolean(h));
        crossBorder = await preOrderCreateCheck({
          buyerCountry,
          supplierCountry,
          hsCodes,
          env,
          db,
        });
      }
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
      // Repeat Offer discount: best-discount-wins (no existing PO-level discount source today).
      const repeatOffer = repeatOfferBySupplier.get(supplierId);
      const repeatDiscount = repeatOffer
        ? Math.floor((subtotal * repeatOffer.percent) / 100)
        : 0;
      if (repeatDiscount > 0) repeatDiscountBySupplier.set(supplierId, repeatDiscount);
      const finalSubtotal = subtotal - repeatDiscount;
      await insertPo(d1, {
        id: poId,
        poNumber,
        businessId: business.id,
        supplierId,
        status: 'pending',
        subtotalCents: finalSubtotal,
        deliveryFeeCents: 0,
        totalCents: finalSubtotal,
        currency: 'LKR',
        deliveryAddress: business.address,
        deliveryCity: business.city,
        deliveryDistrict: business.district,
        notes: input.notes ?? null,
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now,
        direction: crossBorder?.direction ?? 'domestic',
        fxSnapshotId: crossBorder?.fxSnapshotId ?? null,
        rfqId: input.rfqId ?? null,
      });
      for (const row of lineRows) await insertPoItem(d1, row);
      // CRM: mark the matching rfq_supplier lead as 'won' if this checkout is RFQ-linked.
      // markOrdered silently no-ops when no rfq_supplier row matches (e.g. ad-hoc cart
      // checkout, or a supplier invited to multiple RFQs — only the one matching rfqId wins).
      if (input.rfqId) {
        await crm.markOrdered(d1, input.rfqId, supplierId, poId, finalSubtotal);
      }
      await insertOrderEvent(d1, {
        purchaseOrderId: poId,
        actorUserId: userId,
        fromStatus: null,
        toStatus: 'pending',
        reason: 'checkout',
        metadata: { poNumber },
      });
      created.push({
        poId,
        direction: crossBorder?.direction ?? 'domestic',
        paymentMethod: (crossBorder?.direction && crossBorder.direction !== 'domestic') ? 'wire' : 'payhere',
      });

      // Reserve stock atomically; oversell is impossible because the UPDATE is
      // conditional on availability still holding.
      try {
        await inventoryService.reserveForOrder(
          d1,
          queue,
          poId,
          lineRows.map((r) => ({ supplierProductId: r.supplierProductId, quantity: r.quantity })),
          userId,
        );
      } catch (err) {
        await rollbackCreated();
        throw err;
      }

      // Supplier gets the new-order alert, buyer co-workers get a confirmation.
      await notifyOrderParties(
        d1,
        queue,
        { id: poId, poNumber, businessId: business.id, supplierId },
        {
          type: NotificationType.ORDER_PLACED,
          title: `Order ${poNumber} placed`,
          body: ORDER_STATUS_COPY.pending!.buyer,
          supplierTitle: `New order ${poNumber}`,
          supplierBody: ORDER_STATUS_COPY.pending!.supplier,
          excludeUserId: userId,
        },
      );
    }

    let credit: { terms: 'net14' | 'net30'; drawdownIds: string[]; dueAt: number } | null = null;
    if ((input as { paymentMethod?: string }).paymentMethod === 'credit') {
      const terms = (input as { creditTerms?: 'net14' | 'net30' }).creditTerms;
      if (terms !== 'net14' && terms !== 'net30') throw httpError(400, 'VALIDATION_ERROR', 'creditTerms required when paymentMethod=credit');
      const nowCredit = Date.now();
      let facility = await getFacility(d1, business.id);
      if (!facility) facility = await ensureAutoFacility(d1, business.id, nowCredit);
      if (!facility) throw httpError(403, 'credit_not_eligible', 'Business not eligible for credit');
      const [paidCount, overdueCount] = await Promise.all([countPaidOrders(d1, business.id), countOverdue(d1, business.id)]);
      const evalRes = evaluateEligibility({ paidOrderCount: paidCount, overdueCount, facility });
      if (!evalRes.eligible) {
        await rollbackCreated();
        throw httpError(403, evalRes.reason as never, evalRes.reason === 'credit_overdue_blocked' ? 'Overdue credit balance must be repaid first' : 'Business not eligible for credit');
      }
      const poTotals = await db
        .select({ id: purchaseOrders.id, totalCents: purchaseOrders.totalCents })
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.id, created.map((c) => c.poId)))
        .all();
      const poAmounts = (poTotals as Array<{ id: string; totalCents: number }>).map((p) => ({ poId: p.id, amountCents: p.totalCents }));
      const cartTotal = poAmounts.reduce((s, p) => s + p.amountCents, 0);
      if (availableCents(facility) < cartTotal) {
        await rollbackCreated();
        throw httpError(402, 'credit_limit_exceeded', 'Exceeds credit limit');
      }
      try {
        await db.transaction(async (tx: any) => {
          await createDrawdownsForCheckout(tx, { businessId: business.id, userId, terms, poAmounts, now: nowCredit });
        });
      } catch (err) {
        await rollbackCreated();
        throw err;
      }
      const dueAt = dueAtForTerms(terms, nowCredit);
      credit = { terms, drawdownIds: poAmounts.map((p) => p.poId), dueAt };
    }

    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.update(carts).set({ status: 'converted', updatedAt: Date.now() }).where(eq(carts.id, cart.id));
    await recordAudit(d1, {
      actorUserId: userId,
      action: 'cart.checkout',
      resourceType: 'business',
      resourceId: business.id,
      metadata: { poIds: created.map((c) => c.poId) },
    });

    return {
      poIds: created.map((c) => c.poId),
      count: created.length,
      crossBorder: created.map((c) => ({ poId: c.poId, direction: c.direction, paymentMethod: c.paymentMethod })),
      repeatOfferDiscounts: Array.from(repeatDiscountBySupplier.entries()).map(([supplierId, discountCents]) => ({
        supplierId,
        discountCents,
        percent: REPEAT_OFFER_PERCENT,
      })),
      credit,
    };
  },

  async transition(d1: D1Database, input: TransitionInput, queue?: QueueLike) {
    const db = getDb(d1);
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).get();
    if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
    if (!canTransition(po.status as OrderStatus, input.to, input.actor.role)) {
      throw httpError(409, 'CONFLICT', `Illegal transition ${po.status} -> ${input.to} for ${input.actor.role}`);
    }

    // Cross-border customs-doc gate: ship transitions for cross-border orders
    // require uploaded invoice + (if export) COO. Domestic orders are unaffected.
    if (input.to === 'ready_for_pickup' && po.direction !== 'domestic') {
      const { listDocsForOrder } = await import('../cross-border/repository');
      const docs = await listDocsForOrder(db, po.id);
      const kinds = new Set(docs.map((d) => d.kind));
      if (!kinds.has('invoice')) {
        throw httpError(422, 'MISSING_CUSTOMS_DOC', 'Commercial invoice required for cross-border shipment');
      }
      if (po.direction === 'export' && !kinds.has('coo')) {
        throw httpError(422, 'MISSING_CUSTOMS_DOC', 'Certificate of origin required for export');
      }
    }
    // Persist the reason on the order itself for rejected / cancelled moves.
    const reasonColumns: Record<string, string | null> =
      input.to === 'rejected'
        ? { rejectionReason: input.reason ?? null }
        : input.to === 'cancelled'
          ? { cancelledReason: input.reason ?? null }
          : {};
    await updatePoStatus(d1, po.id, input.to, {
      ...tsForStatus(input.to),
      ...reasonColumns,
      // Stamp customs status + invoice number when shipping a cross-border order.
      ...(input.to === 'ready_for_pickup' && po.direction !== 'domestic'
        ? { customsStatus: 'pending' as const, commercialInvoiceNo: `INV-${po.poNumber}` }
        : {}),
    });
    // Settlement eligibility follows order state (spec §21): completion,
    // disputes, and cancellations all change what is payable. Best-effort —
    // never block a legal status move on financial bookkeeping.
    if (['completed', 'disputed', 'cancelled', 'delivered'].includes(input.to)) {
      try {
        const { recomputeEligibilityForPo } = await import('../finance/earnings');
        await recomputeEligibilityForPo(d1, po.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[po.transition] eligibility sync failed', { poId: po.id, to: input.to, err });
      }
    }
    await insertOrderEvent(d1, {
      purchaseOrderId: po.id,
      actorUserId: input.actor.userId,
      fromStatus: po.status,
      toStatus: input.to,
      reason: input.reason ?? null,
      metadata: null,
    });

    // Stock lifecycle: release reservations when the order dies, convert them
    // into a real decrement once the goods are delivered.
    try {
      if (input.to === 'cancelled' || input.to === 'rejected') {
        await inventoryService.releaseForOrder(
          d1,
          queue,
          po.id,
          input.actor.userId,
          `order ${input.to}`,
        );
      } else if (input.to === 'delivered') {
        await inventoryService.commitForOrder(d1, queue, po.id, input.actor.userId);
        // Recompute supplier review aggregate — covers the post-delivery
        // window when buyers are now eligible to submit. No-op if no
        // reviews exist yet (cheap SQL aggregate).
        try {
          const { recomputeAggregate } = await import('../reviews/service');
          await recomputeAggregate(d1, po.supplierId);
        } catch (err) {
          console.error('[po.transition] reviews aggregate recompute failed', err);
        }
      }
    } catch (err) {
      // Never block a legal status move on inventory bookkeeping.
      // eslint-disable-next-line no-console
      console.error('[po.transition] stock sync failed', { poId: po.id, to: input.to, err });
    }

    // Reviews: hide published reviews when dispute opens; restore when leaving
    // `disputed`. Idempotent — safe to fire on every transition.
    try {
      const reviewsHooks = await import('../reviews/hooks');
      if (input.to === 'disputed') {
        await reviewsHooks.onOrderDisputeOpened(d1, po.id);
      } else if (po.status === 'disputed') {
        await reviewsHooks.onOrderDisputeResolved(d1, po.id);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[po.transition] reviews hook failed', { poId: po.id, to: input.to, err });
    }

    // Notify the other side (and co-workers) about the new state.
    const type = ORDER_STATUS_NOTIFICATION[input.to] ?? NotificationType.ORDER_PLACED;
    const copy = ORDER_STATUS_COPY[input.to];
    const suffix = input.reason ? ` Reason: ${input.reason}` : '';
    await notifyOrderParties(
      d1,
      queue,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type,
        title: `Order ${po.poNumber} ${copy?.label ?? input.to}`,
        body: `${copy?.buyer ?? `Status changed to ${input.to}.`}${suffix}`,
        supplierBody: `${copy?.supplier ?? `Status changed to ${input.to}.`}${suffix}`,
        excludeUserId: input.actor.userId,
      },
    );

    await recordAudit(d1, {
      actorUserId: input.actor.userId,
      action: `po.${input.to}`,
      resourceType: 'purchase_order',
      resourceId: po.id,
      metadata: { from: po.status, to: input.to, reason: input.reason ?? null },
    });
    return { ok: true };
  },

  /**
   * Re-create a past order at current prices and stock availability.
   * - Each line is re-priced from the live supplierProduct (no price snapshots).
   * - Items no longer purchasable (deleted, inactive, below MOQ, out of stock)
   *   fail the whole reorder — the buyer is forced to revisit the source order.
   * - Address and notes are carried over from the source PO so this is one tap.
   * - Each source supplier becomes its own new PO (mirroring checkout).
   */
  async reorder(
    d1: D1Database,
    userId: string,
    sourcePoId: string,
    queue?: QueueLike,
  ): Promise<{ poIds: string[]; skipped: Array<{ supplierProductId: string; reason: string }> }> {
    const db = getDb(d1);
    const source = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, sourcePoId)).get();
    if (!source) throw httpError(404, 'NOT_FOUND', 'Source order not found');

    const sourceItems = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, sourcePoId))
      .all();
    if (sourceItems.length === 0) {
      throw httpError(409, 'CONFLICT', 'Source order has no lines to reorder');
    }

    const spIds = sourceItems.map((i) => i.supplierProductId);
    const offers = await db
      .select({ sp: supplierProducts, product: products, supplier: suppliers })
      .from(supplierProducts)
      .innerJoin(products, eq(supplierProducts.productId, products.id))
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(inArray(supplierProducts.id, spIds))
      .all();
    const offerMap = new Map(offers.map((o) => [o.sp.id, o]));

    // Validate every line up front — never half-create a reorder.
    for (const it of sourceItems) {
      const o = offerMap.get(it.supplierProductId);
      if (!o || o.sp.deletedAt || !o.sp.active) {
        throw httpError(409, 'CONFLICT', `${it.productNameSnapshot} is no longer available`);
      }
      const verdict = checkPurchasable(o.sp, it.quantity);
      if (!verdict.ok) {
        throw httpError(
          409,
          verdict.code,
          `${o.product.name}: ${verdict.message}`,
          {
            supplierProductId: o.sp.id,
            ...(verdict.code === 'BELOW_MOQ' ? { minOrderQty: verdict.minOrderQty } : {}),
            ...(verdict.code === 'INSUFFICIENT_STOCK' ? { available: verdict.available } : {}),
          },
        );
      }
    }

    // Group source items by supplier (using live supplierId, not source.snapshot).
    const groups = new Map<string, typeof sourceItems>();
    for (const it of sourceItems) {
      const o = offerMap.get(it.supplierProductId)!;
      const list = groups.get(o.sp.supplierId) ?? [];
      list.push(it);
      groups.set(o.sp.supplierId, list);
    }

    const created: string[] = [];
    const now = Date.now();
    const rollbackCreated = async () => {
      for (const poId of created) {
        try {
          await inventoryService.releaseForOrder(d1, queue, poId, userId, 'reorder rollback');
        } catch {
          /* ignore */
        }
        try {
          await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, poId));
          await db.delete(orderEvents).where(eq(orderEvents.purchaseOrderId, poId));
          await db.delete(purchaseOrders).where(eq(purchaseOrders.id, poId));
        } catch {
          /* ignore */
        }
      }
      created.length = 0;
    };

    for (const [supplierId, lines] of groups) {
      const poId = newId();
      const poNumber = await nextPoNumber(d1, source.businessId);
      let subtotal = 0;
      const lineRows: Array<Parameters<typeof insertPoItem>[1]> = [];
      for (const it of lines) {
        const o = offerMap.get(it.supplierProductId)!;
        const tierSet: TierSet = {
          tier1MinQty: o.sp.tier1MinQty, tier1DiscountPct: o.sp.tier1DiscountPct,
          tier2MinQty: o.sp.tier2MinQty, tier2DiscountPct: o.sp.tier2DiscountPct,
          tier3MinQty: o.sp.tier3MinQty, tier3DiscountPct: o.sp.tier3DiscountPct,
        };
        const tier = resolveTier(tierSet, it.quantity);
        const lineTotal = applyTier(o.sp.priceCents, it.quantity, tier);
        subtotal += lineTotal;
        lineRows.push({
          id: newId(),
          purchaseOrderId: poId,
          supplierProductId: o.sp.id,
          productNameSnapshot: o.product.name,
          unitPriceCents: o.sp.priceCents,
          unitPriceCentsSnapshot: o.sp.priceCents,
          discountPctSnapshot: tier?.discountPct ?? 0,
          quantity: it.quantity,
          lineTotalCents: lineTotal,
        });
      }
      await insertPo(d1, {
        id: poId,
        poNumber,
        businessId: source.businessId,
        supplierId,
        status: 'pending',
        subtotalCents: subtotal,
        deliveryFeeCents: 0,
        totalCents: subtotal,
        currency: 'LKR',
        deliveryAddress: source.deliveryAddress,
        deliveryCity: source.deliveryCity,
        deliveryDistrict: source.deliveryDistrict,
        notes: source.notes,
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
        reason: `reorder of ${source.poNumber}`,
        metadata: { poNumber, sourcePoId: source.id },
      });
      created.push(poId);

      try {
        await inventoryService.reserveForOrder(
          d1,
          queue,
          poId,
          lineRows.map((r) => ({ supplierProductId: r.supplierProductId, quantity: r.quantity })),
          userId,
        );
      } catch (err) {
        await rollbackCreated();
        throw err;
      }

      await notifyOrderParties(
        d1,
        queue,
        { id: poId, poNumber, businessId: source.businessId, supplierId },
        {
          type: NotificationType.ORDER_PLACED,
          title: `Order ${poNumber} placed`,
          body: ORDER_STATUS_COPY.pending!.buyer,
          supplierTitle: `New order ${poNumber}`,
          supplierBody: ORDER_STATUS_COPY.pending!.supplier,
          excludeUserId: userId,
        },
      );
    }

    await recordAudit(d1, {
      actorUserId: userId,
      action: 'po.reorder',
      resourceType: 'purchase_order',
      resourceId: source.id,
      metadata: { sourcePoNumber: source.poNumber, newPoIds: created },
    });

    return { poIds: created, skipped: [] };
  },
};
