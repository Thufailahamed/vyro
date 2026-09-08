import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';
import { resolveProduct } from './productMatch';

/**
 * find_cheapest: locate the lowest-priced live offer for a named product.
 * Ambiguous names produce a `clarification_card` with options instead of a
 * random pick. Emits `recommendation_card` with winner.
 */
export async function findCheapestHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim();
  if (!name) {
    return {
      components: [{ type: 'clarification_card', data: { question: 'Which product?', options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const match = await resolveProduct(repos, name);
  if (match.kind === 'clarify') {
    return {
      components: [{ type: 'clarification_card', data: { question: match.question, options: match.options } }],
      actions: [{ type: 'view_search', label: 'Open search', href: `/search?q=${encodeURIComponent(name)}` }],
      rawSummary: { ambiguous: true, options: match.options },
    };
  }
  if (match.kind === 'unknown') {
    return {
      components: [{
        type: 'clarification_card',
        data: { question: `I couldn't find "${name}". Did you mean one of these?`, options: [] },
      }],
      actions: [{ type: 'view_search', label: 'Open search', href: `/search?q=${encodeURIComponent(name)}` }],
      rawSummary: {},
    };
  }
  const product = match.product;
  const offers = await repos.listOffersByProduct(product.id);
  const live = offers
    .filter((o) => o.availabilityStatus !== 'out_of_stock' && o.active)
    .sort((a, b) => a.priceCents - b.priceCents);
  if (!live.length) {
    return {
      components: [{
        type: 'recommendation_card',
        data: {
          productName: product.name,
          message: 'No active offers right now.',
          priceCents: 0,
          supplierName: null,
          leadTimeDays: null,
          productId: product.id,
        },
      }],
      actions: [{ type: 'view_product', label: `View ${product.name}`, href: `/products/${product.id}` }],
      rawSummary: {},
    };
  }
  const best = live[0]!;
  const highest = live[live.length - 1]!;
  return {
    components: [{
      type: 'recommendation_card',
      data: {
        productName: product.name,
        supplierName: best.supplier.name,
        priceCents: best.priceCents,
        leadTimeDays: best.leadTimeDays,
        availabilityStatus: best.availabilityStatus,
        deliveryAvailable: best.deliveryAvailable,
        minOrderQty: best.minOrderQty,
        savingVsHighestCents: Math.max(0, highest.priceCents - best.priceCents),
        offerCount: live.length,
        productId: product.id,
        supplierId: best.supplier.id,
      },
    }],
    actions: [
      { type: 'view_product', label: `View ${product.name}`, href: `/products/${product.id}` },
      { type: 'view_supplier', label: `View ${best.supplier.name}`, href: `/suppliers/${best.supplier.id}` },
    ],
    rawSummary: {
      productId: product.id,
      productName: product.name,
      bestSupplierId: best.supplier.id,
      bestSupplierName: best.supplier.name,
      priceCents: best.priceCents,
      offerCount: live.length,
      savingVsHighestCents: Math.max(0, highest.priceCents - best.priceCents),
    },
  };
}
