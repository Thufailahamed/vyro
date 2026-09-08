import { parseNlFilters } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

/**
 * search_products: returns list of products matching a free-text query,
 * optionally constrained by NL-extracted filters (price, lead time, sort).
 * Emits `supplier_list_card` with hits and best price per product.
 */
export async function searchProductsHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const slotQuery = (ctx.classify.slots.query ?? ctx.classify.slots.productName ?? '').trim();
  const rawPrompt = ctx.prompt ?? slotQuery;
  const { filters, query: cleanQuery } = parseNlFilters(rawPrompt);
  const q = (cleanQuery || slotQuery).toLowerCase().trim();
  const hasFilter =
    typeof filters.priceMaxCents === 'number' ||
    typeof filters.availableWithinDays === 'number' ||
    Boolean(filters.supplierName);

  if (!q && !hasFilter) {
    return {
      components: [{ type: 'clarification_card', data: { question: 'What are you looking for?', options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }

  const limit = ctx.classify.slots.topN ?? 20;
  const sort = (filters.sort ?? 'recommended') as 'price_asc' | 'lead_asc' | 'recommended';

  const hits = await repos.searchProductsFiltered({
    ...(q ? { query: q } : {}),
    ...filters,
    sort,
    limit,
  });

  if (!hits.length) {
    return {
      components: [{
        type: 'clarification_card',
        data: { question: q ? `No products match "${q}". Try a different search term.` : 'No matches for those filters.', options: [] },
      }],
      actions: [{ type: 'view_search', label: 'Open search', href: `/search?q=${encodeURIComponent(q || rawPrompt)}` }],
      rawSummary: { query: q || null, filters, count: 0 },
    };
  }
  return {
    components: [{
      type: 'supplier_list_card',
      data: {
        title: q ? `Results for "${q}"` : 'Matches for your filters',
        hits: hits.map((p) => ({
          productId: p.id,
          productName: p.name,
          bestSupplierName: p.bestOffer?.supplier.name ?? null,
          bestPriceCents: p.bestOffer?.priceCents ?? null,
          offerCount: p.offerCount,
        })),
      },
    }],
    actions: [{ type: 'view_search', label: `Open "${q || rawPrompt}" in search`, href: `/search?q=${encodeURIComponent(q || rawPrompt)}` }],
    rawSummary: { query: q || null, filters, sort, count: hits.length, productIds: hits.map((p) => p.id) },
  };
}
