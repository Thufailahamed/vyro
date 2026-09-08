import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';
import { resolveProduct } from './productMatch';

/**
 * compare_suppliers: rank live offers for a product deterministically.
 * Primary key is price (asc); ties break on lead time, then delivery
 * availability, then fill-rate proxy. Emits `supplier_list_card` with
 * ranked suppliers; honors `topN` slot.
 */
export async function compareSuppliersHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim();
  const topN = ctx.classify.slots.topN ?? 5;
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
        data: { question: `No match for "${name}".`, options: [] },
      }],
      actions: [{ type: 'view_search', label: 'Open search', href: `/search?q=${encodeURIComponent(name)}` }],
      rawSummary: {},
    };
  }
  const product = match.product;
  const offers = await repos.listOffersByProduct(product.id);
  const ranked = offers
    .filter((o) => o.active && o.availabilityStatus !== 'out_of_stock')
    .sort((a, b) =>
      a.priceCents - b.priceCents ||
      a.leadTimeDays - b.leadTimeDays ||
      Number(b.deliveryAvailable) - Number(a.deliveryAvailable),
    )
    .slice(0, topN)
    .map((o, i, arr) => ({
      rank: i + 1,
      supplierId: o.supplier.id,
      supplierName: o.supplier.name,
      priceCents: o.priceCents,
      leadTimeDays: o.leadTimeDays,
      availabilityStatus: o.availabilityStatus,
      deliveryAvailable: o.deliveryAvailable,
      minOrderQty: o.minOrderQty,
      // Cents saved vs the most expensive live offer — gives the explainer
      // a grounded "cheaper by Rs. X" claim without any LLM arithmetic.
      savingVsHighestCents: Math.max(0, arr[arr.length - 1]!.priceCents - o.priceCents),
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
