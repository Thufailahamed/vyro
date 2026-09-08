import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

type Badge = 'BEST OVERALL' | 'CHEAPEST' | 'FASTEST';

export interface RecommendRow {
  rank: number;
  supplierId: string;
  supplierName: string;
  priceCents: number;
  leadTimeDays: number;
  fillRate: number;
  score: number;
  badge?: Badge;
}

/**
 * supplier_recommend: composite score of price + speed + historical fill rate.
 * Optimizes per `optimizeFor` slot (price|speed|reliability). Emits
 * `supplier_list_card` with ranked suppliers + badges.
 */
export async function supplierRecommendHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim().toLowerCase();
  const focus = ctx.classify.slots.optimizeFor ?? 'reliability';
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
      components: [{ type: 'clarification_card', data: { question: `No match for "${name}".`, options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const offers = await repos.listOffersByProduct(product.id);
  const live = offers.filter((o) => o.active && o.availabilityStatus !== 'out_of_stock');
  if (!live.length) {
    return {
      components: [{
        type: 'recommendation_card',
        data: { productName: product.name, message: 'No active offers.' },
      }],
      actions: [],
      rawSummary: {},
    };
  }

  const supplierIds = [...new Set(live.map((o) => o.supplier.id))];
  const pos = await repos.listPosForSupplier({ businessId: ctx.businessId, supplierIds });

  const stats = new Map<string, { total: number; delivered: number }>();
  for (const p of pos) {
    const s = stats.get(p.supplierId) ?? { total: 0, delivered: 0 };
    s.total++;
    if (p.status === 'delivered') s.delivered++;
    stats.set(p.supplierId, s);
  }

  const minPrice = Math.min(...live.map((o) => o.priceCents));
  const minLead = Math.max(1, Math.min(...live.map((o) => o.leadTimeDays)));

  const scored: RecommendRow[] = live.map((o) => {
    const s = stats.get(o.supplier.id) ?? { total: 0, delivered: 0 };
    const fillRate = s.total === 0 ? 0.5 : s.delivered / s.total;
    const priceTerm = 1 - o.priceCents / Math.max(minPrice, 1);
    const speedTerm = 1 - o.leadTimeDays / minLead;
    const score =
      focus === 'price' ? priceTerm :
      focus === 'speed' ? speedTerm :
      fillRate * 0.6 + priceTerm * 0.25 + speedTerm * 0.15;
    return {
      rank: 0,
      supplierId: o.supplier.id,
      supplierName: o.supplier.name,
      priceCents: o.priceCents,
      leadTimeDays: o.leadTimeDays,
      fillRate,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => (s.rank = i + 1));

  const cheapest = [...scored].sort((a, b) => a.priceCents - b.priceCents)[0];
  const fastest = [...scored].sort((a, b) => a.leadTimeDays - b.leadTimeDays)[0];
  if (cheapest) cheapest.badge = 'CHEAPEST';
  if (fastest && fastest !== cheapest) fastest.badge = 'FASTEST';
  if (scored[0] && scored[0].badge === undefined) scored[0].badge = 'BEST OVERALL';

  return {
    components: [{
      type: 'supplier_list_card',
      data: { title: `Recommended for ${product.name}`, suppliers: scored },
    }],
    actions: scored.slice(0, 3).map((s) => ({
      type: 'view_supplier' as const,
      label: `View ${s.supplierName}`,
      href: `/suppliers/${s.supplierId}`,
    })),
    rawSummary: { productId: product.id, focus, winner: scored[0]?.supplierId },
  };
}
