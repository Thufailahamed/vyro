import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

/**
 * find_cheapest: locate the lowest-priced live offer for a named product.
 * Emits `recommendation_card` with winner or `clarification_card` when missing.
 */
export async function findCheapestHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim().toLowerCase();
  if (!name) {
    return {
      components: [{ type: 'clarification_card', data: { question: 'Which product?', options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const product = await repos.findProductByName(name);
  if (!product) {
    return {
      components: [{
        type: 'clarification_card',
        data: { question: `I couldn't find "${name}". Did you mean one of these?`, options: [] },
      }],
      actions: [{ type: 'view_search', label: 'Open search', href: `/search?q=${encodeURIComponent(name)}` }],
      rawSummary: {},
    };
  }
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
  const best = live[0];
  return {
    components: [{
      type: 'recommendation_card',
      data: {
        productName: product.name,
        supplierName: best.supplier.name,
        priceCents: best.priceCents,
        leadTimeDays: best.leadTimeDays,
        availabilityStatus: best.availabilityStatus,
        productId: product.id,
        supplierId: best.supplier.id,
      },
    }],
    actions: [
      { type: 'view_product', label: `View ${product.name}`, href: `/products/${product.id}` },
      { type: 'view_supplier', label: `View ${best.supplier.name}`, href: `/suppliers/${best.supplier.id}` },
    ],
    rawSummary: { productId: product.id, bestSupplierId: best.supplier.id, priceCents: best.priceCents },
  };
}
