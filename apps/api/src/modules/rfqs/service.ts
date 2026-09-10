import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  rfqs,
  rfqItems,
  rfqSuppliers,
  supplierQuotes,
  supplierQuoteItems,
  quotePriceTiers,
  quoteVersions,
  quoteCounterOffers,
  quoteMessages,
  rfqDocuments,
  rfqTemplates,
  rfqTemplateItems,
  purchaseOrders,
  purchaseOrderItems,
  orderEvents,
  carts,
  cartItems,
  supplierProducts,
  products,
  categories,
  suppliers,
  businesses,
  platformSettings,
} from '@vyro/db/schema';
import { httpError } from '../../lib/errors';
import { newId, canTransitionRfq, NotificationType } from '@vyro/shared';
import type { CreateRfqInput, SubmitQuoteInput, CounterOfferInput } from '@vyro/validation';
import { findRfq, insertRfqEvent, listQuoteItems, listRfqItems, nextQuoteNumber, nextRfqNumber } from './repository';
import { recordAudit } from '../supplierProducts/repository';
import { notifyBusinessOrg, notifySupplierOrg, notifyUsers, listBusinessMemberIds, listSupplierMemberIds } from '../notifications/dispatcher';

interface QueueLike { send: (body: unknown) => Promise<unknown>; }

/**
 * Resolve a supplier_products id for a quote line, creating a locked offer
 * (and, for free-text lines, a custom product under an `rfq-custom`
 * category) when nothing exists. Reuses existing offers — never rewrites
 * catalog prices; the PO snapshot is the price lock.
 */
async function resolveOfferForQuoteLine(
  d1: D1Database,
  supplierId: string,
  rfq: { rfqNumber: string },
  it: { supplierProductId: string | null; productId: string | null; rfqItemId: string | null; description: string; quantity: number; unit: string; unitPriceCents: number },
): Promise<string> {
  const db = getDb(d1);
  const now = Date.now();
  if (it.supplierProductId) {
    const ex = await db.select({ id: supplierProducts.id }).from(supplierProducts).where(eq(supplierProducts.id, it.supplierProductId)).get();
    if (ex) return ex.id;
  }
  let productId = it.productId;
  if (!productId && it.rfqItemId) {
    const ri = await db.select({ productId: rfqItems.productId }).from(rfqItems).where(eq(rfqItems.id, it.rfqItemId)).get();
    if (ri?.productId) productId = ri.productId;
  }
  if (productId) {
    const ex = await db
      .select({ id: supplierProducts.id })
      .from(supplierProducts)
      .where(and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.productId, productId)))
      .get();
    if (ex) return ex.id;
    const offerId = newId();
    await db.insert(supplierProducts).values({
      id: offerId, supplierId, productId, supplierSku: `RFQ-${rfq.rfqNumber}`,
      priceCents: it.unitPriceCents, minOrderQty: Math.max(1, it.quantity),
      leadTimeDays: 7, availabilityStatus: 'in_stock', active: true, createdAt: now, updatedAt: now,
    });
    return offerId;
  }
  // Free-text line: custom product + offer, quarantined in rfq-custom.
  let cat = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, 'rfq-custom')).get();
  if (!cat) {
    const catId = newId();
    await db.insert(categories).values({ id: catId, slug: 'rfq-custom', name: 'RFQ Custom Items', parentId: null, sortOrder: 9999, active: true });
    cat = { id: catId };
  }
  const newProductId = newId();
  await db.insert(products).values({
    id: newProductId, name: it.description.slice(0, 200), description: `Custom item from ${rfq.rfqNumber}`,
    categoryId: cat.id, brand: null, unit: it.unit || 'pc', packSize: null, active: true,
    createdAt: now, updatedAt: now, deletedAt: null,
  } as never);
  const offerId = newId();
  await db.insert(supplierProducts).values({
    id: offerId, supplierId, productId: newProductId, supplierSku: `RFQ-${rfq.rfqNumber}`,
    priceCents: it.unitPriceCents, minOrderQty: Math.max(1, it.quantity),
    leadTimeDays: 7, availabilityStatus: 'in_stock', active: true, createdAt: now, updatedAt: now,
  });
  return offerId;
}

export function computeQuoteTotals(items: Array<{ quantity: number; unitPriceCents: number; discountCents?: number }>, deliveryFeeCents: number, taxCents: number, headerDiscountCents: number) {
  let subtotal = 0;
  for (const it of items) subtotal += it.quantity * it.unitPriceCents - (it.discountCents ?? 0);
  if (subtotal < 0) subtotal = 0;
  const total = subtotal + deliveryFeeCents + taxCents - headerDiscountCents;
  return { subtotalCents: subtotal, totalCents: Math.max(0, total) };
}

async function notifyRfqBusiness(d1: D1Database, queue: QueueLike | undefined, rfqId: string, businessId: string, type: string, title: string, body: string, excludeUserId?: string) {
  try {
    const members = (await listBusinessMemberIds(d1, businessId)).filter((u) => u !== excludeUserId);
    await notifyUsers(d1, queue, members, { type, title, body, link: `/rfqs/${rfqId}` });
  } catch { /* best-effort */ }
}

async function notifyRfqSupplier(d1: D1Database, queue: QueueLike | undefined, supplierId: string, rfqId: string, type: string, title: string, body: string, excludeUserId?: string) {
  try {
    const members = (await listSupplierMemberIds(d1, supplierId)).filter((u) => u !== excludeUserId);
    await notifyUsers(d1, queue, members, { type, title, body, link: `/supplier/quotes?rfq=${rfqId}` });
  } catch { /* best-effort */ }
}

export const rfqService = {
  async thresholds(d1: D1Database) {
    const db = getDb(d1);
    const row = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).get();
    return {
      valueThresholdCents: (row as { rfqValueThresholdCents?: number } | undefined)?.rfqValueThresholdCents ?? 100000,
      quantityThreshold: (row as { rfqQuantityThreshold?: number } | undefined)?.rfqQuantityThreshold ?? 500,
    };
  },

  async qualifies(d1: D1Database, cartTotalCents: number, cartQuantity: number) {
    const t = await this.thresholds(d1);
    return {
      ...t,
      qualifies: cartTotalCents >= t.valueThresholdCents || cartQuantity >= t.quantityThreshold,
      cartTotalCents, cartQuantity,
    };
  },

  async create(d1: D1Database, userId: string, input: CreateRfqInput, queue?: QueueLike) {
    const db = getDb(d1);
    const biz = await db.select().from(businesses).where(eq(businesses.id, input.businessId)).get();
    if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');
    const now = Date.now();
    if (input.deadline && input.deadline <= now) throw httpError(400, 'VALIDATION_ERROR', 'Deadline must be in the future');
    const rfqId = newId();
    const rfqNumber = await nextRfqNumber(d1);
    await db.insert(rfqs).values({
      id: rfqId,
      businessId: input.businessId,
      createdByUserId: userId,
      rfqNumber,
      title: input.title,
      description: input.description ?? null,
      status: 'draft',
      currency: input.currency ?? 'LKR',
      deadline: input.deadline ?? null,
      deliveryLocation: input.deliveryLocation ?? null,
      deliveryCity: input.deliveryCity ?? null,
      deliveryDistrict: input.deliveryDistrict ?? null,
      requiredDeliveryDate: input.requiredDeliveryDate ?? null,
      deliveryRequirements: input.deliveryRequirements ?? null,
      paymentMethod: input.paymentMethod ?? null,
      paymentTerms: input.paymentTerms ?? null,
      specifications: input.specifications ?? null,
      packagingRequirements: input.packagingRequirements ?? null,
      qualityRequirements: input.qualityRequirements ?? null,
      brandPreferences: input.brandPreferences ?? null,
      notes: input.notes ?? null,
      isOpen: input.isOpen ? 1 : 0,
      recurrenceRule: input.recurrenceRule ?? null,
      templateId: input.templateId ?? null,
      createdAt: now, updatedAt: now,
    });
    for (const it of input.items) {
      await db.insert(rfqItems).values({
        id: newId(),
        rfqId,
        productId: it.productId ?? null,
        supplierProductId: it.supplierProductId ?? null,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit ?? 'kg',
        targetPriceCents: it.targetPriceCents ?? null,
        specifications: it.specifications ?? null,
        requiredDate: it.requiredDate ?? null,
        createdAt: now,
      });
    }
    for (const sid of [...new Set(input.supplierIds ?? [])]) {
      const s = await db.select().from(suppliers).where(eq(suppliers.id, sid)).get();
      if (!s) continue;
      await db.insert(rfqSuppliers).values({ id: newId(), rfqId, supplierId: sid, status: 'invited', invitedAt: now });
      await insertRfqEvent(d1, { rfqId, actorUserId: userId, action: 'SUPPLIER_INVITED', metadata: { supplierId: sid } });
      await notifyRfqSupplier(d1, queue, sid, rfqId, NotificationType.RFQ_INVITED, `New RFQ: ${input.title}`, `You were invited to quote ${rfqNumber}.`, userId);
    }
    await insertRfqEvent(d1, { rfqId, actorUserId: userId, action: 'RFQ_CREATED', toStatus: 'draft', metadata: { rfqNumber, itemCount: input.items.length } });
    await recordAudit(d1, { actorUserId: userId, action: 'rfq.created', resourceType: 'rfq', resourceId: rfqId, metadata: { rfqNumber } });
    return { id: rfqId, rfqNumber };
  },

  async createFromCart(d1: D1Database, userId: string, businessId: string, opts: { supplierIds?: string[] | undefined; title?: string | undefined; deadline?: number | undefined }, queue?: QueueLike) {
    const db = getDb(d1);
    const cart = await db.select().from(carts).where(and(eq(carts.businessId, businessId), eq(carts.status, 'open'))).get();
    if (!cart) throw httpError(400, 'VALIDATION_ERROR', 'No open cart');
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id)).all();
    if (!items.length) throw httpError(400, 'VALIDATION_ERROR', 'Cart is empty');
    const spIds = items.map((i) => i.supplierProductId);
    const offers = await db.select({ sp: supplierProducts, product: products }).from(supplierProducts).innerJoin(products, eq(supplierProducts.productId, products.id)).where(inArray(supplierProducts.id, spIds)).all();
    const map = new Map(offers.map((o) => [o.sp.id, o]));
    const rfqItemsInput = items.map((i) => {
      const o = map.get(i.supplierProductId);
      return { description: o?.product.name ?? 'Item', productId: o?.product.id, supplierProductId: i.supplierProductId, quantity: i.quantity, unit: 'pcs' as string };
    });
    return this.create(d1, userId, { businessId, title: opts.title ?? 'Bulk quote from cart', items: rfqItemsInput, supplierIds: opts.supplierIds ?? [], deadline: opts.deadline, currency: 'LKR', isOpen: false, fromCart: true }, queue);
  },

  async publish(d1: D1Database, userId: string, rfqId: string, actor: 'business' | 'admin', queue?: QueueLike) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    if (!canTransitionRfq(rfq.status as never, 'open', actor)) throw httpError(409, 'CONFLICT', `Cannot publish RFQ in status ${rfq.status}`);
    const items = await listRfqItems(d1, rfqId);
    if (!items.length) throw httpError(400, 'VALIDATION_ERROR', 'RFQ has no items');
    const now = Date.now();
    await db.update(rfqs).set({ status: 'open', publishedAt: now, updatedAt: now, version: rfq.version + 1 }).where(eq(rfqs.id, rfqId));
    await insertRfqEvent(d1, { rfqId, actorUserId: userId, action: 'RFQ_OPENED', fromStatus: rfq.status, toStatus: 'open' });
    const invites = await db.select().from(rfqSuppliers).where(eq(rfqSuppliers.rfqId, rfqId)).all();
    for (const inv of invites) await notifyRfqSupplier(d1, queue, inv.supplierId, rfqId, NotificationType.RFQ_OPENED, `RFQ open: ${rfq.title}`, `${rfq.rfqNumber} is now open for quotations.`, userId);
    return { ok: true };
  },

  async invite(d1: D1Database, userId: string, rfqId: string, supplierIds: string[], queue?: QueueLike) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    if (['awarded', 'converted_to_order', 'cancelled', 'closed'].includes(rfq.status)) throw httpError(409, 'CONFLICT', `Cannot invite suppliers to ${rfq.status} RFQ`);
    const now = Date.now();
    for (const sid of [...new Set(supplierIds)]) {
      const ex = await db.select().from(rfqSuppliers).where(and(eq(rfqSuppliers.rfqId, rfqId), eq(rfqSuppliers.supplierId, sid))).get();
      if (ex) continue;
      await db.insert(rfqSuppliers).values({ id: newId(), rfqId, supplierId: sid, status: 'invited', invitedAt: now });
      await insertRfqEvent(d1, { rfqId, actorUserId: userId, action: 'SUPPLIER_INVITED', metadata: { supplierId: sid } });
      await notifyRfqSupplier(d1, queue, sid, rfqId, NotificationType.RFQ_INVITED, `Invited to RFQ: ${rfq.title}`, `${rfq.rfqNumber} — please submit your quotation.`, userId);
    }
    return { ok: true };
  },

  async markViewed(d1: D1Database, rfqId: string, supplierId: string, queue?: QueueLike) {
    const db = getDb(d1);
    const inv = await db.select().from(rfqSuppliers).where(and(eq(rfqSuppliers.rfqId, rfqId), eq(rfqSuppliers.supplierId, supplierId))).get();
    const rfq = await findRfq(d1, rfqId);
    if (inv && !inv.viewedAt) {
      await db.update(rfqSuppliers).set({ status: 'viewed', viewedAt: Date.now() }).where(eq(rfqSuppliers.id, inv.id));
      if (rfq) {
        await insertRfqEvent(d1, { rfqId, action: 'RFQ_VIEWED', metadata: { supplierId } });
        await notifyRfqBusiness(d1, queue, rfqId, rfq.businessId, NotificationType.RFQ_VIEWED, `Supplier viewed ${rfq.rfqNumber}`, 'A supplier viewed your RFQ.');
      }
    }
    if (rfq && rfq.status === 'open') {
      await db.update(rfqs).set({ status: 'quoting', updatedAt: Date.now() }).where(eq(rfqs.id, rfqId));
    }
  },

  async submitQuote(d1: D1Database, userId: string, rfqId: string, supplierId: string, input: SubmitQuoteInput, queue?: QueueLike) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    if (['draft', 'awarded', 'converted_to_order', 'cancelled', 'closed', 'expired'].includes(rfq.status)) throw httpError(409, 'CONFLICT', `Cannot quote ${rfq.status} RFQ`);
    if (rfq.deadline && rfq.deadline < Date.now()) throw httpError(409, 'CONFLICT', 'RFQ deadline passed');
    if (!rfq.isOpen) {
      const inv = await db.select().from(rfqSuppliers).where(and(eq(rfqSuppliers.rfqId, rfqId), eq(rfqSuppliers.supplierId, supplierId))).get();
      if (!inv) throw httpError(403, 'FORBIDDEN', 'Supplier not invited to this RFQ');
    }
    const rfqItemList = await listRfqItems(d1, rfqId);
    const rfqItemIds = new Set(rfqItemList.map((i) => i.id));
    for (const it of input.items) {
      if (it.rfqItemId && !rfqItemIds.has(it.rfqItemId) && !it.isAlternative) throw httpError(400, 'VALIDATION_ERROR', `Unknown RFQ item ${it.rfqItemId}`);
      if (it.discountCents > it.quantity * it.unitPriceCents) throw httpError(400, 'VALIDATION_ERROR', 'Item discount exceeds line value');
    }
    const { subtotalCents, totalCents } = computeQuoteTotals(input.items, input.deliveryFeeCents ?? 0, input.taxCents ?? 0, input.discountCents ?? 0);
    // Coverage: explicit rfqItemId wins; otherwise match by product or description
    // so quotes built without item linkage still count as complete.
    const norm = (s: string) => s.trim().toLowerCase();
    const byProduct = new Map(rfqItemList.filter((i) => i.productId).map((i) => [i.productId as string, i.id]));
    const byDesc = new Map(rfqItemList.map((i) => [norm(i.description), i.id]));
    const covered = new Set<string>();
    for (const it of input.items) {
      if (it.isAlternative) continue;
      if (it.rfqItemId && rfqItemIds.has(it.rfqItemId)) { covered.add(it.rfqItemId); continue; }
      const pid = (it as { productId?: string }).productId;
      if (pid && byProduct.has(pid)) { covered.add(byProduct.get(pid) as string); continue; }
      const hit = byDesc.get(norm(it.description));
      if (hit) covered.add(hit);
    }
    const isPartial = rfqItemList.length > 0 && covered.size < rfqItemList.length ? 1 : 0;
    const now = Date.now();
    const existing = await db.select().from(supplierQuotes).where(and(eq(supplierQuotes.rfqId, rfqId), eq(supplierQuotes.supplierId, supplierId))).all();
    const activeDraft = existing.find((q) => q.status === 'draft');
    let quoteId: string;
    let version = 1;
    if (activeDraft) {
      quoteId = activeDraft.id;
      version = activeDraft.version + 1;
      await db.delete(quotePriceTiers).where(inArray(quotePriceTiers.quoteItemId, (await listQuoteItems(d1, quoteId)).map((i) => i.id))).run().catch(() => undefined);
      await db.delete(supplierQuoteItems).where(eq(supplierQuoteItems.quoteId, quoteId)).run();
      await db.update(supplierQuotes).set({
        status: 'submitted', currency: input.currency ?? 'LKR', subtotalCents, deliveryFeeCents: input.deliveryFeeCents ?? 0,
        taxCents: input.taxCents ?? 0, discountCents: input.discountCents ?? 0, totalCents, validUntil: input.validUntil ?? null,
        estimatedDeliveryDate: input.estimatedDeliveryDate ?? null, paymentTerms: input.paymentTerms ?? null,
        minimumQuantity: input.minimumQuantity ?? null, availability: input.availability ?? null, notes: input.notes ?? null,
        isPartial, version, submittedAt: now, updatedAt: now,
      }).where(eq(supplierQuotes.id, quoteId));
      await db.insert(quoteVersions).values({ id: newId(), quoteId, version, changedByUserId: userId, previousTotalCents: activeDraft.totalCents, newTotalCents: totalCents, changesJson: JSON.stringify({ action: 'resubmit' }), createdAt: now });
      await insertRfqEvent(d1, { rfqId, quoteId, actorUserId: userId, action: 'QUOTE_UPDATED', metadata: { totalCents, version } });
    } else {
      quoteId = newId();
      const quoteNumber = await nextQuoteNumber(d1);
      await db.insert(supplierQuotes).values({
        id: quoteId, rfqId, supplierId, createdByUserId: userId, quoteNumber, status: 'submitted',
        currency: input.currency ?? 'LKR', subtotalCents, deliveryFeeCents: input.deliveryFeeCents ?? 0, taxCents: input.taxCents ?? 0,
        discountCents: input.discountCents ?? 0, totalCents, validUntil: input.validUntil ?? null,
        estimatedDeliveryDate: input.estimatedDeliveryDate ?? null, paymentTerms: input.paymentTerms ?? null,
        minimumQuantity: input.minimumQuantity ?? null, availability: input.availability ?? null, notes: input.notes ?? null,
        isPartial, version: 1, submittedAt: now, createdAt: now, updatedAt: now,
      });
      await db.insert(quoteVersions).values({ id: newId(), quoteId, version: 1, changedByUserId: userId, previousTotalCents: null, newTotalCents: totalCents, changesJson: JSON.stringify({ action: 'create' }), createdAt: now });
      await insertRfqEvent(d1, { rfqId, quoteId, actorUserId: userId, action: 'QUOTE_CREATED', metadata: { quoteNumber, totalCents } });
      await insertRfqEvent(d1, { rfqId, quoteId, actorUserId: userId, action: 'QUOTE_SUBMITTED', metadata: { totalCents } });
    }
    for (const it of input.items) {
      const lineSubtotal = it.quantity * it.unitPriceCents - (it.discountCents ?? 0);
      const qiId = newId();
      await db.insert(supplierQuoteItems).values({
        id: qiId, quoteId, rfqItemId: it.rfqItemId ?? null, productId: it.productId ?? null,
        supplierProductId: it.supplierProductId ?? null, description: it.description, quantity: it.quantity,
        unit: it.unit ?? 'kg', unitPriceCents: it.unitPriceCents, discountCents: it.discountCents ?? 0,
        subtotalCents: lineSubtotal, availableQuantity: it.availableQuantity ?? null,
        estimatedDeliveryDate: it.estimatedDeliveryDate ?? null, isAlternative: it.isAlternative ? 1 : 0,
        alternativeForRfqItemId: it.alternativeForRfqItemId ?? null, specification: it.specification ?? null, notes: it.notes ?? null,
      });
      for (const t of it.tiers ?? []) {
        await db.insert(quotePriceTiers).values({ id: newId(), quoteItemId: qiId, minQty: t.minQty, unitPriceCents: t.unitPriceCents, createdAt: now });
      }
    }
    const inv = await db.select().from(rfqSuppliers).where(and(eq(rfqSuppliers.rfqId, rfqId), eq(rfqSuppliers.supplierId, supplierId))).get();
    if (inv) await db.update(rfqSuppliers).set({ status: 'responded', respondedAt: now }).where(eq(rfqSuppliers.id, inv.id));
    if (['open', 'quoting'].includes(rfq.status)) {
      await db.update(rfqs).set({ status: 'quotes_received', updatedAt: now }).where(eq(rfqs.id, rfqId));
    }
    await notifyRfqBusiness(d1, queue, rfqId, rfq.businessId, NotificationType.QUOTE_RECEIVED, `Quote received for ${rfq.rfqNumber}`, `Total ${totalCents / 100} ${rfq.currency}${isPartial ? ' (partial)' : ''}.`, userId);
    await recordAudit(d1, { actorUserId: userId, action: 'rfq.quote_submitted', resourceType: 'supplier_quote', resourceId: quoteId, metadata: { rfqId, totalCents } });
    return { id: quoteId, totalCents, isPartial: Boolean(isPartial), version };
  },

  async updateQuoteDraft(d1: D1Database, userId: string, quoteId: string, supplierId: string, input: SubmitQuoteInput) {
    const db = getDb(d1);
    const q = await db.select().from(supplierQuotes).where(eq(supplierQuotes.id, quoteId)).get();
    if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
    if (q.supplierId !== supplierId) throw httpError(403, 'FORBIDDEN', 'Not your quote');
    if (['accepted', 'rejected', 'expired', 'superseded'].includes(q.status)) throw httpError(409, 'CONFLICT', `Cannot modify ${q.status} quote`);
    const rfq = await findRfq(d1, q.rfqId);
    if (!rfq || ['awarded', 'converted_to_order', 'cancelled', 'closed', 'expired'].includes(rfq.status)) throw httpError(409, 'CONFLICT', 'RFQ is closed for updates');
    const { subtotalCents, totalCents } = computeQuoteTotals(input.items, input.deliveryFeeCents ?? 0, input.taxCents ?? 0, input.discountCents ?? 0);
    const now = Date.now();
    const prev = q.totalCents;
    const version = q.version + 1;
    await db.delete(supplierQuoteItems).where(eq(supplierQuoteItems.quoteId, quoteId)).run();
    for (const it of input.items) {
      const qiId = newId();
      await db.insert(supplierQuoteItems).values({
        id: qiId, quoteId, rfqItemId: it.rfqItemId ?? null, productId: it.productId ?? null, supplierProductId: it.supplierProductId ?? null,
        description: it.description, quantity: it.quantity, unit: it.unit ?? 'kg', unitPriceCents: it.unitPriceCents,
        discountCents: it.discountCents ?? 0, subtotalCents: it.quantity * it.unitPriceCents - (it.discountCents ?? 0),
        availableQuantity: it.availableQuantity ?? null, estimatedDeliveryDate: it.estimatedDeliveryDate ?? null,
        isAlternative: it.isAlternative ? 1 : 0, alternativeForRfqItemId: it.alternativeForRfqItemId ?? null,
        specification: it.specification ?? null, notes: it.notes ?? null,
      });
      for (const t of it.tiers ?? []) await db.insert(quotePriceTiers).values({ id: newId(), quoteItemId: qiId, minQty: t.minQty, unitPriceCents: t.unitPriceCents, createdAt: now });
    }
    await db.update(supplierQuotes).set({
      currency: input.currency ?? q.currency, subtotalCents, deliveryFeeCents: input.deliveryFeeCents ?? 0, taxCents: input.taxCents ?? 0,
      discountCents: input.discountCents ?? 0, totalCents, validUntil: input.validUntil ?? q.validUntil,
      estimatedDeliveryDate: input.estimatedDeliveryDate ?? q.estimatedDeliveryDate, paymentTerms: input.paymentTerms ?? q.paymentTerms,
      notes: input.notes ?? q.notes, version, updatedAt: now,
    }).where(eq(supplierQuotes.id, quoteId));
    await db.insert(quoteVersions).values({ id: newId(), quoteId, version, changedByUserId: userId, previousTotalCents: prev, newTotalCents: totalCents, changesJson: JSON.stringify({ action: 'update' }), createdAt: now });
    await insertRfqEvent(d1, { rfqId: q.rfqId, quoteId, actorUserId: userId, action: 'QUOTE_UPDATED', metadata: { previousTotalCents: prev, newTotalCents: totalCents, version } });
    return { ok: true, version, totalCents };
  },

  async counter(d1: D1Database, userId: string, quoteId: string, byType: 'business' | 'supplier', input: CounterOfferInput, queue?: QueueLike) {
    const db = getDb(d1);
    const q = await db.select().from(supplierQuotes).where(eq(supplierQuotes.id, quoteId)).get();
    if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
    if (['accepted', 'rejected', 'expired', 'withdrawn', 'superseded'].includes(q.status)) throw httpError(409, 'CONFLICT', `Cannot negotiate a ${q.status} quote`);
    const rfq = await findRfq(d1, q.rfqId);
    if (!rfq || ['awarded', 'converted_to_order', 'cancelled', 'closed', 'expired'].includes(rfq.status)) throw httpError(409, 'CONFLICT', 'Negotiation closed');
    const now = Date.now();
    await db.insert(quoteCounterOffers).values({
      id: newId(), quoteId, rfqId: q.rfqId, offeredByType: byType, offeredByUserId: userId,
      proposedTotalCents: input.proposedTotalCents, proposedUnitPricesJson: input.proposedUnitPrices ? JSON.stringify(input.proposedUnitPrices) : null,
      message: input.message, status: 'pending', createdAt: now,
    });
    await db.update(supplierQuotes).set({ status: 'negotiating', updatedAt: now }).where(eq(supplierQuotes.id, quoteId));
    if (rfq.status !== 'under_review') await db.update(rfqs).set({ status: 'under_review', updatedAt: now }).where(eq(rfqs.id, rfq.id));
    await insertRfqEvent(d1, { rfqId: q.rfqId, quoteId, actorUserId: userId, action: 'COUNTER_OFFER_CREATED', metadata: { byType, proposedTotalCents: input.proposedTotalCents } });
    if (byType === 'business') await notifyRfqSupplier(d1, queue, q.supplierId, q.rfqId, NotificationType.QUOTE_COUNTERED, `Counter-offer on ${q.quoteNumber}`, input.message.slice(0, 200), userId);
    else await notifyRfqBusiness(d1, queue, q.rfqId, rfq.businessId, NotificationType.QUOTE_COUNTERED, `Supplier countered ${q.quoteNumber}`, input.message.slice(0, 200), userId);
    return { ok: true };
  },

  async respondCounter(d1: D1Database, userId: string, counterId: string, accept: boolean, queue?: QueueLike) {
    const db = getDb(d1);
    const c = await db.select().from(quoteCounterOffers).where(eq(quoteCounterOffers.id, counterId)).get();
    if (!c) throw httpError(404, 'NOT_FOUND', 'Counter-offer not found');
    if (c.status !== 'pending') throw httpError(409, 'CONFLICT', 'Counter-offer already resolved');
    const q = await db.select().from(supplierQuotes).where(eq(supplierQuotes.id, c.quoteId)).get();
    if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
    const now = Date.now();
    await db.update(quoteCounterOffers).set({ status: accept ? 'accepted' : 'rejected', respondedAt: now }).where(eq(quoteCounterOffers.id, counterId));
    if (accept) {
      const prev = q.totalCents;
      const version = q.version + 1;
      await db.update(supplierQuotes).set({ totalCents: c.proposedTotalCents, version, status: 'submitted', updatedAt: now }).where(eq(supplierQuotes.id, q.id));
      await db.insert(quoteVersions).values({ id: newId(), quoteId: q.id, version, changedByUserId: userId, previousTotalCents: prev, newTotalCents: c.proposedTotalCents, changesJson: JSON.stringify({ action: 'counter_accepted', counterId }), createdAt: now });
      await insertRfqEvent(d1, { rfqId: q.rfqId, quoteId: q.id, actorUserId: userId, action: 'COUNTER_OFFER_ACCEPTED', metadata: { counterId, newTotalCents: c.proposedTotalCents } });
      const rfq = await findRfq(d1, q.rfqId);
      if (rfq) {
        await notifyRfqBusiness(d1, queue, q.rfqId, rfq.businessId, NotificationType.QUOTE_COUNTERED, `Counter accepted on ${q.quoteNumber}`, `Agreed total ${c.proposedTotalCents / 100}.`, userId);
        await notifyRfqSupplier(d1, queue, q.supplierId, q.rfqId, NotificationType.QUOTE_COUNTERED, `Counter accepted on ${q.quoteNumber}`, `Agreed total ${c.proposedTotalCents / 100}.`, userId);
      }
    }
    return { ok: true, accepted: accept };
  },

  async requestRevision(d1: D1Database, userId: string, quoteId: string, message: string, queue?: QueueLike) {
    const db = getDb(d1);
    const q = await db.select().from(supplierQuotes).where(eq(supplierQuotes.id, quoteId)).get();
    if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
    await db.insert(quoteMessages).values({ id: newId(), rfqId: q.rfqId, quoteId, senderType: 'business', senderUserId: userId, message: `Revision requested: ${message}`, createdAt: Date.now() });
    await insertRfqEvent(d1, { rfqId: q.rfqId, quoteId, actorUserId: userId, action: 'QUOTE_UPDATED', metadata: { revisionRequested: true } });
    const rfq = await findRfq(d1, q.rfqId);
    if (rfq) await notifyRfqSupplier(d1, queue, q.supplierId, q.rfqId, NotificationType.RFQ_REVISION_REQUESTED, `Revision requested on ${q.quoteNumber}`, message.slice(0, 200), userId);
    return { ok: true };
  },

  async award(d1: D1Database, userId: string, rfqId: string, quoteId: string, acceptedAlternativeItemIds: string[], queue?: QueueLike) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    if (['awarded', 'converted_to_order'].includes(rfq.status)) throw httpError(409, 'CONFLICT', 'RFQ already awarded');
    if (['cancelled', 'closed', 'expired', 'draft'].includes(rfq.status)) throw httpError(409, 'CONFLICT', `Cannot award ${rfq.status} RFQ`);
    const q = await db.select().from(supplierQuotes).where(eq(supplierQuotes.id, quoteId)).get();
    if (!q || q.rfqId !== rfqId) throw httpError(404, 'NOT_FOUND', 'Quote not found for this RFQ');
    if (!['submitted', 'under_review', 'negotiating'].includes(q.status)) throw httpError(409, 'CONFLICT', `Cannot award ${q.status} quote`);
    if (q.validUntil && q.validUntil < Date.now()) throw httpError(409, 'CONFLICT', 'Quote has expired');
    const now = Date.now();
    // Concurrency guard: only transition if still in a pre-award state.
    const res = await db.run(sql`UPDATE rfqs SET status='awarded', awarded_quote_id=${quoteId}, awarded_at=${now}, updated_at=${now}, version=version+1 WHERE id=${rfqId} AND status IN ('open','quoting','quotes_received','under_review')`);
    const changes = Number((res as { meta?: { changes?: number } }).meta?.changes ?? 1);
    if (changes === 0) throw httpError(409, 'CONFLICT', 'RFQ was modified concurrently');
    if (acceptedAlternativeItemIds.length) {
      await db.update(supplierQuoteItems).set({ alternativeAccepted: 1 }).where(inArray(supplierQuoteItems.id, acceptedAlternativeItemIds));
    }
    await db.update(supplierQuotes).set({ status: 'accepted', acceptedAt: now, updatedAt: now }).where(eq(supplierQuotes.id, quoteId));
    const losers = await db.select().from(supplierQuotes).where(and(eq(supplierQuotes.rfqId, rfqId), sql`${supplierQuotes.id} != ${quoteId}`, sql`${supplierQuotes.status} IN ('submitted','under_review','negotiating','draft')`)).all();
    for (const l of losers) {
      await db.update(supplierQuotes).set({ status: 'rejected', rejectedAt: now, updatedAt: now }).where(eq(supplierQuotes.id, l.id));
      await insertRfqEvent(d1, { rfqId, quoteId: l.id, actorUserId: userId, action: 'QUOTE_REJECTED', metadata: { awardedTo: quoteId } });
      await notifyRfqSupplier(d1, queue, l.supplierId, rfqId, NotificationType.QUOTE_REJECTED, `Quote ${l.quoteNumber} not selected`, `${rfq.rfqNumber} was awarded to another supplier.`);
    }
    await insertRfqEvent(d1, { rfqId, quoteId, actorUserId: userId, action: 'RFQ_AWARDED', fromStatus: rfq.status, toStatus: 'awarded', metadata: { quoteId, totalCents: q.totalCents } });
    await insertRfqEvent(d1, { rfqId, quoteId, actorUserId: userId, action: 'QUOTE_ACCEPTED', metadata: { totalCents: q.totalCents } });
    await notifyRfqSupplier(d1, queue, q.supplierId, rfqId, NotificationType.QUOTE_ACCEPTED, `Your quote ${q.quoteNumber} was accepted`, `Total ${q.totalCents / 100} ${q.currency}. Awaiting purchase order.`, userId);
    await notifyRfqBusiness(d1, queue, rfqId, rfq.businessId, NotificationType.QUOTE_ACCEPTED, `Awarded ${q.quoteNumber}`, `PO can now be created from the accepted quote.`, userId);
    await recordAudit(d1, { actorUserId: userId, action: 'rfq.awarded', resourceType: 'rfq', resourceId: rfqId, metadata: { quoteId } });
    return { ok: true };
  },

  async convertToOrder(d1: D1Database, userId: string, rfqId: string, queue?: QueueLike) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    if (rfq.status !== 'awarded') throw httpError(409, 'CONFLICT', 'RFQ must be awarded before creating a PO');
    if (rfq.convertedPoId) throw httpError(409, 'CONFLICT', 'PO already created for this RFQ');
    if (!rfq.awardedQuoteId) throw httpError(409, 'CONFLICT', 'No awarded quote');
    const q = await db.select().from(supplierQuotes).where(eq(supplierQuotes.id, rfq.awardedQuoteId)).get();
    if (!q || q.status !== 'accepted') throw httpError(409, 'CONFLICT', 'Awarded quote is not accepted');
    const items = await db.select().from(supplierQuoteItems).where(eq(supplierQuoteItems.quoteId, q.id)).all();
    if (!items.length) throw httpError(409, 'CONFLICT', 'Quote has no items');
    const biz = await db.select().from(businesses).where(eq(businesses.id, rfq.businessId)).get();
    if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');
    const now = Date.now();
    const poId = newId();
    const poNumber = `PO-RFQ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${poId.slice(-6).toUpperCase()}`;
    // Locked agreed prices: unit prices come from the quote, never the catalog.
    await db.insert(purchaseOrders).values({
      id: poId, poNumber, businessId: rfq.businessId, supplierId: q.supplierId, status: 'pending',
      subtotalCents: q.subtotalCents, deliveryFeeCents: q.deliveryFeeCents, totalCents: q.totalCents, currency: q.currency,
      deliveryAddress: rfq.deliveryLocation ?? biz.address, deliveryCity: rfq.deliveryCity ?? biz.city,
      deliveryDistrict: rfq.deliveryDistrict ?? biz.district,
      notes: `From RFQ ${rfq.rfqNumber} / quote ${q.quoteNumber}. ${rfq.notes ?? ''}`.slice(0, 2000),
      createdByUserId: userId, createdAt: now, updatedAt: now,
      rfqId, quoteId: q.id,
    } as never);
    for (const it of items) {
      // Every PO line needs a real supplier_products row (FK). Resolve:
      // quoted offer -> existing offer for (supplier, product) -> create a
      // locked offer (agreed price) -> create custom product + offer.
      // The PO snapshots the AGREED price, so later catalog changes never
      // affect this order (quote price lock).
      const offerId = await resolveOfferForQuoteLine(d1, q.supplierId, rfq, it);
      await db.insert(purchaseOrderItems).values({
        id: newId(), purchaseOrderId: poId,
        supplierProductId: offerId,
        productNameSnapshot: it.description, unitPriceCents: it.unitPriceCents, unitPriceCentsSnapshot: it.unitPriceCents,
        discountPctSnapshot: 0, quantity: it.quantity, lineTotalCents: it.subtotalCents,
      });
    }
    await db.insert(orderEvents).values({ id: newId(), purchaseOrderId: poId, actorUserId: userId, fromStatus: null, toStatus: 'pending', reason: `created from RFQ ${rfq.rfqNumber}`, metadata: JSON.stringify({ rfqId, quoteId: q.id }), createdAt: now });
    await db.update(rfqs).set({ status: 'converted_to_order', convertedPoId: poId, updatedAt: now, version: rfq.version + 1 }).where(eq(rfqs.id, rfqId));
    await insertRfqEvent(d1, { rfqId, quoteId: q.id, actorUserId: userId, action: 'ORDER_CREATED_FROM_QUOTE', fromStatus: 'awarded', toStatus: 'converted_to_order', metadata: { poId, poNumber } });
    await recordAudit(d1, { actorUserId: userId, action: 'rfq.order_created', resourceType: 'purchase_order', resourceId: poId, metadata: { rfqId, quoteId: q.id } });
    try {
      const { notifyOrderParties } = await import('../notifications/dispatcher');
      const { NotificationType: NT, ORDER_STATUS_COPY } = await import('@vyro/shared');
      await notifyOrderParties(d1, queue, { id: poId, poNumber, businessId: rfq.businessId, supplierId: q.supplierId }, {
        type: NT.ORDER_PLACED, title: `Order ${poNumber} placed from RFQ`, body: ORDER_STATUS_COPY.pending!.buyer, excludeUserId: userId,
      });
    } catch { /* best-effort */ }
    return { poId, poNumber };
  },

  async cancel(d1: D1Database, userId: string, rfqId: string, actor: 'business' | 'admin') {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    if (!canTransitionRfq(rfq.status as never, 'cancelled', actor)) throw httpError(409, 'CONFLICT', `Cannot cancel ${rfq.status} RFQ`);
    const now = Date.now();
    await db.update(rfqs).set({ status: 'cancelled', cancelledAt: now, updatedAt: now }).where(eq(rfqs.id, rfqId));
    await insertRfqEvent(d1, { rfqId, actorUserId: userId, action: 'RFQ_CANCELLED', fromStatus: rfq.status, toStatus: 'cancelled' });
    const invites = await db.select().from(rfqSuppliers).where(eq(rfqSuppliers.rfqId, rfqId)).all();
    for (const inv of invites) await notifySupplierOrg(d1, undefined, inv.supplierId, { type: NotificationType.RFQ_CANCELLED, title: `RFQ ${rfq.rfqNumber} cancelled`, body: rfq.title, link: `/supplier/quotes?rfq=${rfqId}` });
    return { ok: true };
  },

  async close(d1: D1Database, userId: string, rfqId: string) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    await db.update(rfqs).set({ status: 'closed', closedAt: Date.now(), updatedAt: Date.now() }).where(eq(rfqs.id, rfqId));
    await insertRfqEvent(d1, { rfqId, actorUserId: userId, action: 'RFQ_CANCELLED', fromStatus: rfq.status, toStatus: 'closed', metadata: { closed: true } });
    return { ok: true };
  },

  async reopen(d1: D1Database, userId: string, rfqId: string, deadline?: number) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    if (rfq.status !== 'expired') throw httpError(409, 'CONFLICT', 'Only expired RFQs can be reopened');
    const now = Date.now();
    const dl = deadline ?? now + 7 * 24 * 3600 * 1000;
    if (dl <= now) throw httpError(400, 'VALIDATION_ERROR', 'Deadline must be in the future');
    await db.update(rfqs).set({ status: 'open', deadline: dl, expiredAt: null, updatedAt: now }).where(eq(rfqs.id, rfqId));
    await insertRfqEvent(d1, { rfqId, actorUserId: userId, action: 'RFQ_OPENED', fromStatus: 'expired', toStatus: 'open', metadata: { reopened: true } });
    return { ok: true };
  },

  async expireDue(d1: D1Database, queue?: QueueLike) {
    const db = getDb(d1);
    const now = Date.now();
    const due = await db.select().from(rfqs).where(and(sql`${rfqs.deadline} IS NOT NULL AND ${rfqs.deadline} < ${now}`, sql`${rfqs.status} IN ('open','quoting','quotes_received','under_review')`)).all();
    for (const r of due) {
      await db.update(rfqs).set({ status: 'expired', expiredAt: now, updatedAt: now }).where(eq(rfqs.id, r.id));
      await insertRfqEvent(d1, { rfqId: r.id, action: 'RFQ_EXPIRED', fromStatus: r.status, toStatus: 'expired' });
      await notifyBusinessOrg(d1, queue, r.businessId, { type: NotificationType.RFQ_EXPIRED, title: `RFQ ${r.rfqNumber} expired`, body: r.title, link: `/rfqs/${r.id}` });
      const quotes = await db.select().from(supplierQuotes).where(and(eq(supplierQuotes.rfqId, r.id), sql`${supplierQuotes.status} IN ('submitted','under_review','negotiating','draft')`)).all();
      for (const qq of quotes) await db.update(supplierQuotes).set({ status: 'expired', updatedAt: now }).where(eq(supplierQuotes.id, qq.id));
    }
    // Quote-level validity expiry
    const qDue = await db.select().from(supplierQuotes).where(and(sql`${supplierQuotes.validUntil} IS NOT NULL AND ${supplierQuotes.validUntil} < ${now}`, sql`${supplierQuotes.status} IN ('submitted','under_review','negotiating')`)).all();
    for (const qq of qDue) await db.update(supplierQuotes).set({ status: 'expired', updatedAt: now }).where(eq(supplierQuotes.id, qq.id));
    return { rfqsExpired: due.length, quotesExpired: qDue.length };
  },

  async compare(d1: D1Database, rfqId: string) {
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    const db = getDb(d1);
    const quotes = await db.select().from(supplierQuotes).where(eq(supplierQuotes.rfqId, rfqId)).all();
    const items = await listRfqItems(d1, rfqId);
    const out: Array<Record<string, unknown>> = [];
    for (const q of quotes) {
      const qi = await db.select().from(supplierQuoteItems).where(eq(supplierQuoteItems.quoteId, q.id)).all();
      const tiers = qi.length ? await db.select().from(quotePriceTiers).where(inArray(quotePriceTiers.quoteItemId, qi.map((i) => i.id))).all() : [];
      const sup = await db.select().from(suppliers).where(eq(suppliers.id, q.supplierId)).get();
      const landed = q.subtotalCents + q.deliveryFeeCents + q.taxCents - q.discountCents;
      out.push({
        quote: q, items: qi, tiers, supplier: sup ? { id: sup.id, name: sup.name, district: sup.district, city: sup.city, rating: (sup as { ratingAvg?: number }).ratingAvg ?? null } : null,
        landedCents: landed, coverage: `${qi.filter((i) => !i.isAlternative).length}/${items.length}`,
        isPartial: Boolean(q.isPartial),
        valid: !q.validUntil || q.validUntil >= Date.now(),
      });
    }
    const complete = out.filter((o) => !(o.isPartial as boolean) && (o.valid as boolean));
    const sorted = [...complete].sort((a, b) => (a.landedCents as number) - (b.landedCents as number));
    const fastest = [...out].filter((o) => o.valid).sort((a, b) => ((a.quote as { estimatedDeliveryDate?: number | null }).estimatedDeliveryDate ?? Infinity) - ((b.quote as { estimatedDeliveryDate?: number | null }).estimatedDeliveryDate ?? Infinity));
    // Split-supplier optimization: cheapest per RFQ item across quotes.
    const perItemBest: Array<{ rfqItemId: string; quoteId: string; unitPriceCents: number; subtotalCents: number }> = [];
    for (const ri of items) {
      let best: { quoteId: string; unitPriceCents: number; subtotalCents: number } | null = null;
      for (const o of out) {
        const qi = (o.items as Array<{ rfqItemId: string | null; unitPriceCents: number; subtotalCents: number; isAlternative: number }>).find((i) => i.rfqItemId === ri.id && !i.isAlternative);
        if (qi && (!best || qi.subtotalCents < best.subtotalCents)) best = { quoteId: (o.quote as { id: string }).id, unitPriceCents: qi.unitPriceCents, subtotalCents: qi.subtotalCents };
      }
      if (best) perItemBest.push({ rfqItemId: ri.id, ...best });
    }
    const splitTotal = perItemBest.reduce((s, b) => s + b.subtotalCents, 0);
    const splitSuppliers = [...new Set(perItemBest.map((b) => b.quoteId))].length;
    return {
      rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, currency: rfq.currency, status: rfq.status },
      items,
      quotes: out,
      bestPriceQuoteId: sorted[0] ? ((sorted[0].quote as { id: string }).id) : null,
      fastestQuoteId: fastest[0] ? ((fastest[0].quote as { id: string }).id) : null,
      splitOptimization: { perItemBest, splitItemsTotalCents: splitTotal, supplierCount: splitSuppliers },
    };
  },

  async analyticsBusiness(d1: D1Database, businessId: string) {
    const db = getDb(d1);
    const all = await db.select().from(rfqs).where(eq(rfqs.businessId, businessId)).all();
    const active = all.filter((r) => ['open', 'quoting', 'quotes_received', 'under_review'].includes(r.status));
    const quotes = all.length ? await db.select().from(supplierQuotes).where(inArray(supplierQuotes.rfqId, all.map((r) => r.id))).all() : [];
    const versions = quotes.length ? await db.select().from(quoteVersions).where(inArray(quoteVersions.quoteId, quotes.map((q) => q.id))).all() : [];
    let negotiationSavings = 0;
    for (const q of quotes) {
      const v = versions.filter((x) => x.quoteId === q.id).sort((a, b) => a.version - b.version);
      const first = v[0];
      const last = v[v.length - 1];
      if (v.length > 1 && first?.newTotalCents != null && last?.newTotalCents != null) {
        negotiationSavings += Math.max(0, first.newTotalCents - last.newTotalCents);
      }
    }
    return {
      activeRfqs: active.length, totalRfqs: all.length, quotesReceived: quotes.length,
      awarded: all.filter((r) => ['awarded', 'converted_to_order'].includes(r.status)).length,
      negotiationSavingsCents: negotiationSavings,
      acceptanceRate: quotes.length ? all.filter((r) => ['awarded', 'converted_to_order'].includes(r.status)).length / Math.max(1, all.length) : 0,
    };
  },

  async analyticsSupplier(d1: D1Database, supplierId: string) {
    const db = getDb(d1);
    const invites = await db.select().from(rfqSuppliers).where(eq(rfqSuppliers.supplierId, supplierId)).all();
    const quotes = await db.select().from(supplierQuotes).where(eq(supplierQuotes.supplierId, supplierId)).all();
    const won = quotes.filter((q) => q.status === 'accepted').length;
    return {
      rfqsReceived: invites.length, quotesSubmitted: quotes.length,
      won, lost: quotes.filter((q) => q.status === 'rejected').length,
      winRate: quotes.length ? won / quotes.length : 0,
      responseRate: invites.length ? quotes.length / invites.length : 0,
    };
  },

  async discoverSuppliers(d1: D1Database, rfqId: string) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    const items = await listRfqItems(d1, rfqId);
    const productIds = items.map((i) => i.productId).filter(Boolean) as string[];
    let scored: Array<{ supplier: typeof suppliers.$inferSelect; coverage: number; productCount: number }> = [];
    if (productIds.length) {
      const offers = await db.select().from(supplierProducts).where(inArray(supplierProducts.productId, productIds)).all();
      const bySupplier = new Map<string, Set<string>>();
      for (const o of offers) {
        if (o.deletedAt || !o.active) continue;
        const s = bySupplier.get(o.supplierId) ?? new Set<string>();
        s.add(o.productId); bySupplier.set(o.supplierId, s);
      }
      const supIds = [...bySupplier.keys()];
      if (supIds.length) {
        const sups = await db.select().from(suppliers).where(inArray(suppliers.id, supIds)).all();
        scored = sups.map((s) => ({ supplier: s, coverage: (bySupplier.get(s.id)?.size ?? 0) / productIds.length, productCount: bySupplier.get(s.id)?.size ?? 0 }));
        scored.sort((a, b) => b.coverage - a.coverage);
      }
    } else {
      const sups = await db.select().from(suppliers).limit(20).all();
      scored = sups.map((s) => ({ supplier: s, coverage: 0, productCount: 0 }));
    }
    const invited = new Set((await db.select().from(rfqSuppliers).where(eq(rfqSuppliers.rfqId, rfqId)).all()).map((i) => i.supplierId));
    return scored.slice(0, 20).map((s) => ({ ...s, invited: invited.has(s.supplier.id) }));
  },

  async sendMessage(d1: D1Database, userId: string, senderType: 'business' | 'supplier', rfqId: string, quoteId: string | undefined, message: string, attachmentR2Key: string | undefined, queue?: QueueLike) {
    const db = getDb(d1);
    const rfq = await findRfq(d1, rfqId);
    if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
    const id = newId();
    await db.insert(quoteMessages).values({ id, rfqId, quoteId: quoteId ?? null, senderType, senderUserId: userId, message, attachmentR2Key: attachmentR2Key ?? null, createdAt: Date.now() });
    if (senderType === 'business' && quoteId) {
      const q = await db.select().from(supplierQuotes).where(eq(supplierQuotes.id, quoteId)).get();
      if (q) await notifyRfqSupplier(d1, queue, q.supplierId, rfqId, NotificationType.RFQ_MESSAGE, `Message on ${rfq.rfqNumber}`, message.slice(0, 200), userId);
    } else {
      await notifyRfqBusiness(d1, queue, rfqId, rfq.businessId, NotificationType.RFQ_MESSAGE, `Message on ${rfq.rfqNumber}`, message.slice(0, 200), userId);
    }
    return { id };
  },

  async addDocument(d1: D1Database, userId: string, rfqId: string, doc: { quoteId?: string | undefined; r2Key: string; fileName: string; mimeType?: string | undefined; sizeBytes?: number | undefined; kind?: string | undefined }) {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
    if (doc.mimeType && !allowed.includes(doc.mimeType)) throw httpError(400, 'VALIDATION_ERROR', 'File type not allowed');
    if (doc.sizeBytes && doc.sizeBytes > 10 * 1024 * 1024) throw httpError(400, 'VALIDATION_ERROR', 'File too large (max 10MB)');
    const db = getDb(d1);
    const id = newId();
    await db.insert(rfqDocuments).values({ id, rfqId, quoteId: doc.quoteId ?? null, uploadedByUserId: userId, r2Key: doc.r2Key, fileName: doc.fileName, mimeType: doc.mimeType ?? null, sizeBytes: doc.sizeBytes ?? null, kind: doc.kind ?? 'specification', createdAt: Date.now() });
    return { id };
  },

  async saveTemplate(d1: D1Database, userId: string, input: { businessId: string; name: string; description?: string | undefined; deliveryLocation?: string | undefined; paymentTerms?: string | undefined; items: CreateRfqInput['items'] }) {
    const db = getDb(d1);
    const id = newId();
    const now = Date.now();
    await db.insert(rfqTemplates).values({ id, businessId: input.businessId, createdByUserId: userId, name: input.name, description: input.description ?? null, deliveryLocation: input.deliveryLocation ?? null, paymentTerms: input.paymentTerms ?? null, createdAt: now, updatedAt: now });
    for (const it of input.items) {
      await db.insert(rfqTemplateItems).values({ id: newId(), templateId: id, productId: it.productId ?? null, description: it.description, quantity: it.quantity, unit: it.unit ?? 'kg', targetPriceCents: it.targetPriceCents ?? null, specifications: it.specifications ?? null });
    }
    return { id };
  },

  async createFromTemplate(d1: D1Database, userId: string, templateId: string, overrides: { deadline?: number | undefined; supplierIds?: string[] | undefined }, queue?: QueueLike) {
    const db = getDb(d1);
    const t = await db.select().from(rfqTemplates).where(eq(rfqTemplates.id, templateId)).get();
    if (!t) throw httpError(404, 'NOT_FOUND', 'Template not found');
    const items = await db.select().from(rfqTemplateItems).where(eq(rfqTemplateItems.templateId, templateId)).all();
    return this.create(d1, userId, {
      businessId: t.businessId, title: t.name, description: t.description ?? undefined,
      deliveryLocation: t.deliveryLocation ?? undefined, paymentTerms: t.paymentTerms ?? undefined,
      items: items.map((i) => ({ description: i.description, productId: i.productId ?? undefined, quantity: i.quantity, unit: i.unit, targetPriceCents: i.targetPriceCents ?? undefined, specifications: i.specifications ?? undefined })),
      supplierIds: overrides.supplierIds ?? [], deadline: overrides.deadline, currency: 'LKR', isOpen: false, fromCart: false,
    }, queue);
  },

  async aiSummary(d1: D1Database, rfqId: string) {
    const c = await this.compare(d1, rfqId);
    const valid = (c.quotes as Array<{ quote: { id: string; quoteNumber: string }; landedCents: number; valid: boolean; isPartial: boolean; supplier: { name: string } | null }>).filter((q) => q.valid && !q.isPartial).sort((a, b) => a.landedCents - b.landedCents);
    const best = valid[0];
    const fastestId = c.fastestQuoteId as string | null;
    const lines = valid.map((q, i) => `${i + 1}. ${q.supplier?.name ?? 'Supplier'} (${q.quote.quoteNumber}): ${q.landedCents / 100} — ${i === 0 ? 'lowest landed cost' : `+${(q.landedCents - (best?.landedCents ?? q.landedCents)) / 100} vs best`}`).join('\n');
    const recommendation = best
      ? `${best.supplier?.name ?? 'Best quote'} (${best.quote.quoteNumber}) is recommended: lowest verified total landed cost at ${best.landedCents / 100}. ${fastestId && fastestId !== best.quote.id ? 'Check fastest-delivery option if timing matters.' : 'It is also among the fastest options.'}`
      : 'No complete valid quotes yet — invite more suppliers or wait for submissions.';
    return {
      bestQuoteId: best?.quote.id ?? null, lowestPriceQuoteId: best?.quote.id ?? null, fastestQuoteId: fastestId,
      summary: lines, recommendation,
      splitSuggestion: (c.splitOptimization as { splitItemsTotalCents: number; supplierCount: number }).supplierCount > 1
        ? `Splitting across suppliers could lower item totals to ${(c.splitOptimization as { splitItemsTotalCents: number }).splitItemsTotalCents / 100} before extra delivery fees — weigh complexity vs savings.`
        : null,
    };
  },

  suggestNegotiation(targetTotalCents: number, quantity: number, unit: string) {
    const perUnit = (targetTotalCents / 100 / Math.max(1, quantity)).toFixed(2);
    return `We are looking to purchase ${quantity}${unit} and would like to know whether you can offer ${targetTotalCents / 100} total (approx ${perUnit} per ${unit}) for the full quantity with your standard delivery terms.`;
  },
};
