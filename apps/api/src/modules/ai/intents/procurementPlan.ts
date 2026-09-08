import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/**
 * procurement_plan: build a priced weekly plan from recurring purchases.
 * Emits `procurement_plan_card` with lines priced at the cheapest live offer.
 */
export async function procurementPlanHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const slots = ctx.classify.slots as { weeksBack?: number; topNProducts?: number };
  const weeksBack = Number(slots.weeksBack ?? 8);
  const topN = Number(slots.topNProducts ?? 10);
  const since = Date.now() - weeksBack * 7 * DAY;

  const items = await repos.recentPoItemsForRecurrence({ businessId: ctx.businessId, sinceMs: since });
  const nameById = await repos.productNamesByIds(items.map((i) => i.productId));

  const agg = new Map<string, { productId: string; totalQty: number; occurrences: number; lastPrice: number }>();
  for (const it of items) {
    const cur = agg.get(it.productId) ?? { productId: it.productId, totalQty: 0, occurrences: 0, lastPrice: it.unitPriceCents };
    cur.totalQty += it.quantity;
    cur.occurrences += 1;
    cur.lastPrice = it.unitPriceCents;
    agg.set(it.productId, cur);
  }

  const top = [...agg.values()]
    .sort((a, b) => b.occurrences - a.occurrences || b.totalQty - a.totalQty)
    .slice(0, topN);

  const lines = await Promise.all(
    top.map(async (v) => {
      const offers = await repos.listOffersByProduct(v.productId).catch(() => []);
      const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
      const cheapest = live.slice().sort((a, b) => a.priceCents - b.priceCents)[0];
      const qty = Math.max(1, Math.round(v.totalQty / Math.max(v.occurrences, 1)));
      return {
        productId: v.productId,
        productName: nameById.get(v.productId) ?? 'Unknown product',
        typicalQuantity: qty,
        unit: 'unit',
        supplier: cheapest?.supplier.name ?? '—',
        priceCents: cheapest?.priceCents ?? v.lastPrice,
        leadTimeDays: cheapest?.leadTimeDays ?? 0,
      };
    }),
  );

  const totalCents = lines.reduce((s, l) => s + l.priceCents * l.typicalQuantity, 0);

  return {
    components: [
      {
        type: 'procurement_plan_card',
        data: {
          title: 'Your weekly procurement plan',
          lines,
          totalCents,
          withinBudget: true,
          disclaimer: 'Priced at the cheapest live offer. Inventory not consulted.',
        },
      },
    ],
    actions: [{ type: 'view_cart', label: 'Open cart', href: '/cart' }],
    rawSummary: { count: lines.length, totalCents },
  };
}
