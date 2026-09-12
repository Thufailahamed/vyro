import { findCatalogMatch } from './substitution';
import type { QuoteItemDraft, SolverInput, SolverOutput } from './types';

export const MARGIN_FLOOR_FACTOR = 0.88; // Maximum 12% discount off catalog base price
export const DEFAULT_DELIVERY_FEE_CENTS = 250000; // Rs. 2,500 base delivery
export const LOCAL_DISTRICT_DELIVERY_FEE_CENTS = 150000; // Rs. 1,500 local district delivery

export function solveQuoteDraft(input: SolverInput): SolverOutput {
  const { strategy, rfqItems, catalogOffers, includeAlternatives, rfq } = input;

  const quoteItems: QuoteItemDraft[] = [];
  let substitutesCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const item of rfqItems) {
    const match = findCatalogMatch(item, catalogOffers, includeAlternatives);

    if (match.matchType === 'unmatched' || !match.offer) {
      unmatchedCount++;
      quoteItems.push({
        rfqItemId: item.id,
        productId: item.productId ?? undefined,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: 0,
        discountCents: 0,
        subtotalCents: 0,
        isAlternative: false,
        rationale: 'Item not found in current catalog. Please enter price manually.',
        stockStatus: 'unmatched',
      });
      continue;
    }

    const offer = match.offer;
    const basePrice = offer.basePriceCents;
    const floorPrice = Math.round(basePrice * MARGIN_FLOOR_FACTOR);
    const targetPrice = item.targetPriceCents;

    let unitPrice = basePrice;
    let discountCents = 0;
    let rationale = '';

    if (match.isAlternative) {
      substitutesCount++;
    } else {
      matchedCount++;
    }

    if (strategy === 'win_deal') {
      let desiredNetPrice = Math.round(basePrice * 0.94); // default 6% discount
      if (targetPrice && targetPrice > 0) {
        desiredNetPrice = Math.round(targetPrice * 0.98); // undercut buyer target by 2%
      }

      if (desiredNetPrice < floorPrice) {
        desiredNetPrice = floorPrice;
        rationale = `Floor protection applied: price set to minimum margin threshold (Rs. ${(floorPrice / 100).toLocaleString()}).`;
      } else {
        rationale = targetPrice
          ? `Competitive 2% undercut on buyer target price (Rs. ${(desiredNetPrice / 100).toLocaleString()}).`
          : `Aggressive 6% volume discount to capture bid.`;
      }

      discountCents = Math.max(0, basePrice - desiredNetPrice);
      unitPrice = basePrice;
    } else if (strategy === 'premium_margin') {
      unitPrice = Math.round(basePrice * 1.04); // 4% markup
      discountCents = 0;
      rationale = 'Standard catalog rate + premium margin for expedited fulfillment and quality assurance.';
    } else {
      // Balanced: standard catalog rate with volume discount if applicable
      unitPrice = basePrice;
      const isBulk = item.quantity >= 500 || item.quantity * basePrice >= 10000000; // >= Rs. 100,000
      if (isBulk) {
        discountCents = Math.round(basePrice * 0.03); // 3% bulk volume discount
        rationale = 'Standard wholesale catalog rate with 3% bulk volume discount applied.';
      } else {
        discountCents = 0;
        rationale = 'Standard wholesale catalog rate.';
      }
    }

    const netPrice = Math.max(0, unitPrice - discountCents);
    const subtotalCents = netPrice * item.quantity;

    // Bulk tier: propose extra 4% discount at 2x quantity
    const tierMinQty = item.quantity * 2;
    const tierNetPrice = Math.max(floorPrice, Math.round(netPrice * 0.96));
    const tier = {
      minQty: tierMinQty,
      unitPriceCents: tierNetPrice,
    };

    const stockStatus = match.isAlternative
      ? 'substitute'
      : offer.availabilityStatus === 'low'
        ? 'low'
        : 'in_stock';

    quoteItems.push({
      rfqItemId: item.id,
      productId: offer.productId,
      supplierProductId: offer.supplierProductId,
      description: match.isAlternative ? offer.name : item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: unitPrice,
      discountCents,
      subtotalCents,
      isAlternative: match.isAlternative,
      alternativeForRfqItemId: match.isAlternative ? item.id : undefined,
      notes: match.alternativeReason,
      rationale,
      stockStatus,
      tier,
    });
  }

  // Delivery fee estimation
  let deliveryFeeCents = input.supplierDeliveryFeeCents ?? DEFAULT_DELIVERY_FEE_CENTS;
  if (rfq.deliveryDistrict && rfq.deliveryDistrict.toLowerCase() === 'colombo') {
    deliveryFeeCents = LOCAL_DISTRICT_DELIVERY_FEE_CENTS;
  }

  // Terms & Validity
  const validDays = 14;
  let paymentTerms = 'Net 7 days from invoice';
  if (strategy === 'win_deal' && rfq.paymentTermsRequested) {
    paymentTerms = rfq.paymentTermsRequested;
  } else if (strategy === 'premium_margin') {
    paymentTerms = 'Bank transfer before dispatch / Cash on Delivery (COD)';
  }

  return {
    items: quoteItems,
    deliveryFeeCents,
    validDays,
    paymentTerms,
    strategy,
    substitutesCount,
    matchedCount,
    unmatchedCount,
  };
}
