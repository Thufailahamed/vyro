import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

/**
 * search_products: return list of products matching a free-text query.
 * Emits `supplier_list_card` with hits and best price per product.
 */
export async function searchProductsHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const q = (ctx.classify.slots.query ?? ctx.classify.slots.productName ?? '').trim().toLowerCase();
  if (!q) {
    return {
      components: [{ type: 'clarification_card', data: { question: 'What are you looking for?', options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const hits = await repos.searchProducts(q, 20);
  if (!hits.length) {
    return {
      components: [{
        type: 'clarification_card',
        data: { question: `No products match "${q}". Try a different search term.`, options: [] },
      }],
      actions: [{ type: 'view_search', label: 'Open search', href: `/search?q=${encodeURIComponent(q)}` }],
      rawSummary: { query: q, count: 0 },
    };
  }
  return {
    components: [{
      type: 'supplier_list_card',
      data: {
        title: `Results for "${q}"`,
        hits: hits.map((p) => ({
          productId: p.id,
          productName: p.name,
          bestSupplierName: p.bestOffer?.supplier.name ?? null,
          bestPriceCents: p.bestOffer?.priceCents ?? null,
          offerCount: p.offerCount,
        })),
      },
    }],
    actions: [{ type: 'view_search', label: `Open "${q}" in search`, href: `/search?q=${encodeURIComponent(q)}` }],
    rawSummary: { query: q, count: hits.length, productIds: hits.map((p) => p.id) },
  };
}
