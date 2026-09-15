import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import type {
  RepeatOffer,
  RepeatOfferApplied,
  RepeatOfferPreviewResponse,
  RepeatOfferAnalyticsResponse,
} from '@vyro/validation';
import { repeatOffersRepository } from './repository';
import {
  REPEAT_OFFER_THRESHOLD_CENTS,
  REPEAT_OFFER_WINDOW_MS,
  REPEAT_OFFER_PERCENT,
} from './constants';

export interface CartSupplier {
  supplierId: string;
  subtotalCents: number;
  existingDiscountCents: number;
}

export const repeatOffers = {
  async computeEligibility(
    d1: D1Database,
    businessId: string,
    now: number = Date.now(),
  ): Promise<RepeatOffer[]> {
    const spend = await repeatOffersRepository.trailingSpendForBusiness(
      d1,
      businessId,
      now,
      REPEAT_OFFER_WINDOW_MS,
    );
    const offers: RepeatOffer[] = [];
    for (const [supplierId, trailingSpendCents] of spend) {
      if (trailingSpendCents >= REPEAT_OFFER_THRESHOLD_CENTS) {
        offers.push({ supplierId, percent: REPEAT_OFFER_PERCENT, trailingSpendCents, supplierName: '' });
      }
    }
    return offers;
  },

  applyForCart(
    _businessId: string,
    offers: RepeatOffer[],
    cartSuppliers: CartSupplier[],
  ): RepeatOfferApplied[] {
    const offersBySupplier = new Map(offers.map((o) => [o.supplierId, o]));
    const out: RepeatOfferApplied[] = [];
    for (const s of cartSuppliers) {
      if (s.existingDiscountCents > 0) continue;
      const offer = offersBySupplier.get(s.supplierId);
      if (!offer) continue;
      out.push({
        supplierId: s.supplierId,
        discountCents: Math.floor((s.subtotalCents * offer.percent) / 100),
        percent: offer.percent,
      });
    }
    return out;
  },

  async previewForBuyer(
    d1: D1Database,
    businessId: string,
    now: number = Date.now(),
  ): Promise<RepeatOfferPreviewResponse> {
    const offers = await this.computeEligibility(d1, businessId, now);
    return {
      offers: offers.map((o) => ({ ...o, supplierName: '' })),
    };
  },

  async analyticsForSupplier(
    d1: D1Database,
    supplierId: string,
    now: number = Date.now(),
  ): Promise<RepeatOfferAnalyticsResponse> {
    const db = getDb(d1);
    const since = now - 30 * 24 * 60 * 60 * 1000;
    const rows = await db
      .select({
        businessId: purchaseOrders.businessId,
        completedAt: purchaseOrders.completedAt,
        subtotalCents: purchaseOrders.subtotalCents,
      })
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.supplierId, supplierId),
        eq(purchaseOrders.status, 'completed'),
        gte(purchaseOrders.completedAt, since),
      ));

    let totalSavings = 0;
    const byRetailer: Array<{
      businessId: string;
      trailingSpendCents: number;
      triggeredAt: number;
    }> = [];
    for (const r of rows) {
      const subtotal = r.subtotalCents ?? 0;
      const savings = Math.floor((subtotal * REPEAT_OFFER_PERCENT) / 100);
      totalSavings += savings;
      byRetailer.push({
        businessId: r.businessId,
        trailingSpendCents: subtotal,
        triggeredAt: r.completedAt ?? now,
      });
    }
    return {
      triggeredCount: rows.length,
      totalSavingsCents: totalSavings,
      byRetailer,
    };
  },
};
