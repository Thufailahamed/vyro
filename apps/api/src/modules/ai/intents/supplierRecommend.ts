import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';
import { resolveProduct } from './productMatch';

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
 * supplier_recommend: deterministic composite score over live offers.
 *
 *   score = wPrice * price + wSpeed * speed + wReliability * fillRate
 *         + wAvail * availability + wDelivery * delivery [- MOQ penalty]
 *
 * All terms are normalized to [0,1] (higher is better). The LLM never scores —
 * it only explains the ranked result. Weights shift with `optimizeFor`.
 */
export async function supplierRecommendHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim();
  const focus = ctx.classify.slots.optimizeFor ?? 'reliability';
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
      actions: [],
      rawSummary: { ambiguous: true, options: match.options },
    };
  }
  if (match.kind === 'unknown') {
    return {
      components: [{ type: 'clarification_card', data: { question: `No match for "${name}".`, options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const product = match.product;
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
  const requestedQty = ctx.classify.slots.quantity ?? 1;

  // Weights per optimization focus. Each row sums to 1.
  const weights =
    focus === 'price'
      ? { price: 0.6, speed: 0.1, reliability: 0.1, avail: 0.1, delivery: 0.1 }
      : focus === 'speed'
        ? { price: 0.15, speed: 0.55, reliability: 0.1, avail: 0.1, delivery: 0.1 }
        : { price: 0.3, speed: 0.15, reliability: 0.35, avail: 0.1, delivery: 0.1 };

  const scored: RecommendRow[] = live.map((o) => {
    const s = stats.get(o.supplier.id) ?? { total: 0, delivered: 0 };
    // Unknown history -> neutral prior, not zero (zero would bury new suppliers).
    const fillRate = s.total === 0 ? 0.5 : s.delivered / s.total;
    const priceTerm = minPrice / Math.max(o.priceCents, 1);
    const speedTerm = minLead / Math.max(o.leadTimeDays, 1);
    const availTerm = o.availabilityStatus === 'in_stock' ? 1 : 0.5;
    const deliveryTerm = o.deliveryAvailable ? 1 : 0.4;
    // Penalize offers whose MOQ the buyer can't meet; never fully exclude
    // (buyer may still want to see the option).
    const moqTerm = requestedQty >= o.minOrderQty ? 1 : 0.3;
    const score =
      (weights.price * priceTerm +
        weights.speed * speedTerm +
        weights.reliability * fillRate +
        weights.avail * availTerm +
        weights.delivery * deliveryTerm) *
      moqTerm;
    return {
      rank: 0,
      supplierId: o.supplier.id,
      supplierName: o.supplier.name,
      priceCents: o.priceCents,
      leadTimeDays: o.leadTimeDays,
      fillRate,
      score: Math.round(score * 1000) / 1000,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  // Honor the requested optimization directly: price focus ranks cheapest
  // first, speed focus ranks fastest first (composite score breaks ties).
  // Reliability (default) trusts the composite score outright.
  if (focus === 'price') scored.sort((a, b) => a.priceCents - b.priceCents || b.score - a.score);
  else if (focus === 'speed') scored.sort((a, b) => a.leadTimeDays - b.leadTimeDays || b.score - a.score);
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
    rawSummary: {
      productId: product.id,
      productName: product.name,
      focus,
      winner: scored[0]?.supplierId,
      winnerName: scored[0]?.supplierName,
      winnerPriceCents: scored[0]?.priceCents,
      offerCount: scored.length,
    },
  };
}
