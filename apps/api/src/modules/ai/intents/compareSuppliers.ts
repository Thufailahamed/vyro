import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

/**
 * compare_suppliers: rank live offers for a product by price (asc).
 * Emits `supplier_list_card` with ranked suppliers; honors `topN` slot.
 */
export async function compareSuppliersHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim().toLowerCase();
  const topN = ctx.classify.slots.topN ?? 5;
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
        data: { question: `No match for "${name}".`, options: [] },
      }],
      actions: [{ type: 'view_search', label: 'Open search', href: `/search?q=${encodeURIComponent(name)}` }],
      rawSummary: {},
    };
  }
  const offers = await repos.listOffersByProduct(product.id);
  const ranked = offers
    .filter((o) => o.active && o.availabilityStatus !== 'out_of_stock')
    .sort((a, b) => a.priceCents - b.priceCents)
    .slice(0, topN)
    .map((o, i) => ({
      rank: i + 1,
      supplierId: o.supplier.id,
      supplierName: o.supplier.name,
      priceCents: o.priceCents,
      leadTimeDays: o.leadTimeDays,
      availabilityStatus: o.availabilityStatus,
    }));
  return {
    components: [{
      type: 'supplier_list_card',
      data: { title: `${product.name} — supplier comparison`, suppliers: ranked },
    }],
    actions: ranked.slice(0, 3).map((s) => ({
      type: 'view_supplier' as const,
      label: `View ${s.supplierName}`,
      href: `/suppliers/${s.supplierId}`,
    })),
    rawSummary: { productId: product.id, count: ranked.length },
  };
}
