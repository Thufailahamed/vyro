import { eq, or, desc } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  businesses,
  users,
  businessMembers,
  products,
  supplierProducts,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  auditLogs,
} from '@vyro/db/schema';
import {
  parseConversationalMessage,
  formatWhatsAppDraftReply,
  formatWhatsAppTrackingReply,
  formatWhatsAppPriceReply,
  type ConversationalOrderResponse,
  type OrderDraft,
  type DraftItem,
} from '@vyro/ai';
import type { Env } from '../../env';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';

const DRAFTS_CACHE = new Map<string, { businessId: string; draft: OrderDraft; createdAt: number }>();

export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return `94${digits.slice(1)}`;
  }
  if (digits.startsWith('94')) {
    return digits;
  }
  return digits;
}

export async function resolveBusinessByPhone(
  env: Env,
  rawPhone: string,
): Promise<{ businessId: string; businessName: string; userId: string } | null> {
  const phone = normalizePhoneNumber(rawPhone);
  const db = getDb(env.DB);

  // 1. Search in businesses.phone
  const biz = await db
    .select()
    .from(businesses)
    .where(or(eq(businesses.phone, phone), eq(businesses.phone, `+${phone}`)))
    .get();

  if (biz) {
    const member = await db
      .select()
      .from(businessMembers)
      .where(eq(businessMembers.businessId, biz.id))
      .get();
    return { businessId: biz.id, businessName: biz.name, userId: member?.userId ?? 'sys' };
  }

  // 2. Search in users.phone
  const user = await db
    .select()
    .from(users)
    .where(or(eq(users.phone, phone), eq(users.phone, `+${phone}`)))
    .get();

  if (user) {
    const member = await db
      .select({ businessId: businessMembers.businessId, businessName: businesses.name })
      .from(businessMembers)
      .innerJoin(businesses, eq(businessMembers.businessId, businesses.id))
      .where(eq(businessMembers.userId, user.id))
      .get();

    if (member) {
      return { businessId: member.businessId, businessName: member.businessName, userId: user.id };
    }
  }

  return null;
}

export async function processConversationalOrder(
  env: Env,
  businessId: string,
  message: string,
): Promise<ConversationalOrderResponse> {
  const db = getDb(env.DB);
  const biz = await db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  const parsed = parseConversationalMessage(message);

  // Intent 1: Tracking
  if (parsed.intent === 'order_tracking') {
    let order;
    if (parsed.poNumberQuery) {
      order = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.poNumber, parsed.poNumberQuery))
        .get();
    } else {
      order = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.businessId, businessId))
        .orderBy(desc(purchaseOrders.createdAt))
        .get();
    }

    if (!order) {
      return {
        replyText: `Could not find any recent purchase orders for ${biz.name}.`,
        intent: 'order_tracking',
      };
    }

    const trackingInfo = {
      poNumber: order.poNumber,
      status: order.status,
      totalCents: order.totalCents,
      deliveryAddress: `${order.deliveryAddress}, ${order.deliveryCity}`,
    };

    return {
      replyText: formatWhatsAppTrackingReply(trackingInfo),
      intent: 'order_tracking',
      trackingInfo,
    };
  }

  // Intent 2: Price inquiry
  if (parsed.intent === 'price_inquiry' && parsed.items[0]) {
    const itemQuery = parsed.items[0].query;
    const offers = await db
      .select({
        productName: products.name,
        priceCents: supplierProducts.priceCents,
        unit: products.unit,
        supplierName: suppliers.name,
      })
      .from(supplierProducts)
      .innerJoin(products, eq(supplierProducts.productId, products.id))
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(eq(supplierProducts.active, true))
      .all();

    const matched = offers.find((o) =>
      o.productName.toLowerCase().includes(itemQuery.toLowerCase()),
    );

    if (matched) {
      return {
        replyText: formatWhatsAppPriceReply({
          product: matched.productName,
          priceCents: matched.priceCents,
          unit: matched.unit,
          supplierName: matched.supplierName,
        }),
        intent: 'price_inquiry',
      };
    }

    return {
      replyText: `We couldn't find an active wholesale listing matching "${itemQuery}". Please try another search.`,
      intent: 'price_inquiry',
    };
  }

  // Intent 3: Order Draft / Reorder
  const catalogOffers = await db
    .select({
      supplierProductId: supplierProducts.id,
      productId: products.id,
      productName: products.name,
      priceCents: supplierProducts.priceCents,
      unit: products.unit,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
    })
    .from(supplierProducts)
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
    .where(eq(supplierProducts.active, true))
    .all();

  const draftItems: DraftItem[] = [];

  for (const item of parsed.items) {
    const q = item.query.toLowerCase();
    const offer = catalogOffers.find((o) => o.productName.toLowerCase().includes(q));
    if (offer) {
      const lineTotal = offer.priceCents * item.quantity;
      draftItems.push({
        productId: offer.productId,
        supplierProductId: offer.supplierProductId,
        productName: offer.productName,
        quantity: item.quantity,
        unit: item.unit || offer.unit,
        unitPriceCents: offer.priceCents,
        totalCents: lineTotal,
        supplierId: offer.supplierId,
        supplierName: offer.supplierName,
      });
    }
  }

  if (draftItems.length === 0) {
    return {
      replyText: `👋 Hello! To place an order, please send a message like:\n_"Send 5 bags samba rice and 2 bags sugar"_\n\nOr ask for pricing with:\n_"What is the price of coconut oil?"_`,
      intent: 'help',
    };
  }

  const draftId = newId();
  const totalCents = draftItems.reduce((sum, it) => sum + it.totalCents, 0);
  const draft: OrderDraft = {
    id: draftId,
    totalCents,
    deliveryDateEstimate: 'Tomorrow',
    items: draftItems,
  };

  DRAFTS_CACHE.set(draftId, { businessId, draft, createdAt: Date.now() });

  const confirmUrl = `https://vyro.lk/orders/conversational?draft=${draftId}`;
  const replyText = formatWhatsAppDraftReply({
    draft,
    businessName: biz.name,
    confirmUrl,
  });

  return {
    replyText,
    intent: 'order_draft',
    draft,
  };
}

export async function confirmConversationalOrder(
  env: Env,
  userId: string,
  businessId: string,
  draftId: string,
): Promise<{ ok: boolean; poIds: string[]; totalCents: number }> {
  const cached = DRAFTS_CACHE.get(draftId);
  if (!cached || cached.businessId !== businessId) {
    throw httpError(404, 'NOT_FOUND', 'Order draft expired or not found. Please request a new order.');
  }

  const db = getDb(env.DB);
  const biz = await db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  const { draft } = cached;
  const bySupplier = new Map<string, typeof draft.items>();
  for (const it of draft.items) {
    const list = bySupplier.get(it.supplierId) ?? [];
    list.push(it);
    bySupplier.set(it.supplierId, list);
  }

  const poIds: string[] = [];

  for (const [supplierId, supItems] of bySupplier.entries()) {
    const poId = newId();
    const poSubtotal = supItems.reduce((s, it) => s + it.totalCents, 0);
    const poNumber = `PO-${Date.now().toString().slice(-6)}`;

    await db.insert(purchaseOrders).values({
      id: poId,
      poNumber,
      businessId,
      supplierId,
      status: 'pending',
      subtotalCents: poSubtotal,
      deliveryFeeCents: 0,
      totalCents: poSubtotal,
      currency: 'LKR',
      deliveryAddress: biz.address,
      deliveryCity: biz.city,
      deliveryDistrict: biz.district,
      notes: 'Generated via WhatsApp / Conversational Ordering Bot',
      createdByUserId: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    for (const it of supItems) {
      await db.insert(purchaseOrderItems).values({
        id: newId(),
        purchaseOrderId: poId,
        supplierProductId: it.supplierProductId,
        productNameSnapshot: it.productName,
        unitPriceCents: it.unitPriceCents,
        quantity: it.quantity,
        lineTotalCents: it.totalCents,
      });
    }

    poIds.push(poId);
  }

  DRAFTS_CACHE.delete(draftId);

  // Audit log
  try {
    await db.insert(auditLogs).values({
      id: newId(),
      action: 'ai.conversational.order_confirmed',
      resourceType: 'business',
      resourceId: businessId,
      metadata: JSON.stringify({ poIds, totalCents: draft.totalCents, itemCount: draft.items.length }),
      createdAt: Date.now(),
    });
  } catch (_e) {
    // non-fatal
  }

  return { ok: true, poIds, totalCents: draft.totalCents };
}
