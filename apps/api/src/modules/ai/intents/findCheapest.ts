import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';
import { resolveProduct } from './productMatch';

const DEFAULT_TOPN = 8;
const MAX_TOPN = 20;

/**
 * find_cheapest: locate the lowest-priced live offer for a named product.
 * Ambiguous names produce a `clarification_card` with options instead of a
 * random pick. Emits `recommendation_card` with winner.
 *
 * When the buyer asks "find cheapest suppliers" without naming a product,
 * we cannot pick one — so we return a cross-catalog top-N list of the
 * cheapest live offers (one per product). A `supplier_list_card` keeps the
 * UI in the same shape as `search_products` so the buyer can drill in.
 */
export async function findCheapestHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim();
  if (!name) {
    const requested = Number(ctx.classify.slots.topN);
    const topN = Number.isFinite(requested) && requested > 0
      ? Math.min(MAX_TOPN, Math.max(1, Math.floor(requested)))
      : DEFAULT_TOPN;

    const rows = await repos.topCheapestOffers({ limit: topN });
    if (!rows.length) {
      return {
        components: [{
          type: 'clarification_card',
          data: { question: 'No live offers in the catalog yet. Add a product to get started.', options: [] },
        }],
        actions: [{ type: 'view_search', label: 'Browse catalog', href: '/marketplace' }],
        rawSummary: { empty: true },
      };
    }

    const highest = Math.max(...rows.map((r) => r.priceCents));
    const suppliers = rows.map((r, i) => ({
      rank: i + 1,
      productId: r.productId,
      productName: r.productName,
      supplierName: r.supplierName,
      supplierId: r.supplierId,
      priceCents: r.priceCents,
      leadTimeDays: r.leadTimeDays,
      deliveryAvailable: r.deliveryAvailable,
      minOrderQty: r.minOrderQty,
      availabilityStatus: r.availabilityStatus,
      offerCount: r.offerCount,
      savingVsHighestCents: Math.max(0, highest - r.priceCents),
      badge: i === 0 ? 'best_landed' : undefined,
    }));

    const top = suppliers[0]!;
    return {
      components: [{
        type: 'supplier_list_card',
        data: {
          title: 'Cheapest live offers across your catalog',
          suppliers,
        },
      }],
      actions: [
        { type: 'view_supplier', label: `View ${top.supplierName}`, href: `/suppliers/${top.supplierId}` },
        { type: 'view_search', label: 'Browse catalog', href: '/marketplace' },
      ],
      rawSummary: {
        mode: 'cross_catalog',
        topN: suppliers.length,
        topProductName: top.productName,
        topSupplierName: top.supplierName,
        topPriceCents: top.priceCents,
        offerCount: top.offerCount,
        savingVsHighestCents: top.savingVsHighestCents,
        productIds: suppliers.map((s) => s.productId),
      },
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
