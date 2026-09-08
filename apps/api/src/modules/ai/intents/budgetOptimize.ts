import { fitBudget } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/**
 * budget_optimize: take the recurring procurement pattern and swap each line
 * to its cheapest live offer when needed to fit a user-specified budget cap.
 * Never drops lines. Reports impossibility when cap is below the cheapest
 * achievable total.
 */
export async function budgetOptimizeHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const slots = ctx.classify.slots as { budgetCents?: number; weeksBack?: number };
  const budgetCents = Number(slots.budgetCents ?? 0);

  if (!budgetCents || budgetCents <= 0) {
    return {
      components: [
        {
          type: 'clarification_card',
          data: {
            question: 'What budget should I fit this order under? (e.g. under Rs. 100,000)',
            options: ['Rs. 50,000', 'Rs. 100,000', 'Rs. 250,000', 'Rs. 500,000'],
          },
        },
      ],
      actions: [],
      rawSummary: { clarified: true },
    };
  }

  const weeksBack = Number(slots.weeksBack ?? 8);
  const since = Date.now() - weeksBack * 7 * DAY;
  const items = await repos.recentPoItemsForRecurrence({ businessId: ctx.businessId, sinceMs: since });
  const nameById = await repos.productNamesByIds(items.map((i) => i.productId));

  const agg = new Map<
    string,
    { productId: string; productName: string; totalQty: number; occurrences: number; lastPrice: number; lastSupplier: string }
  >();
  for (const it of items) {
    const cur = agg.get(it.productId) ?? {
      productId: it.productId,
      productName: nameById.get(it.productId) ?? 'Unknown product',
      totalQty: 0,
      occurrences: 0,
      lastPrice: it.unitPriceCents,
      lastSupplier: '—',
    };
    cur.totalQty += it.quantity;
    cur.occurrences += 1;
    cur.lastPrice = it.unitPriceCents;
    agg.set(it.productId, cur);
  }

  const top = [...agg.values()].slice(0, 10);

  const base = await Promise.all(
    top.map(async (v) => {
      const offers = await repos.listOffersByProduct(v.productId).catch(() => []);
      const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
      const cheapest = live.slice().sort((a, b) => a.priceCents - b.priceCents)[0];
      const quantity = Math.max(1, Math.round(v.totalQty / Math.max(v.occurrences, 1)));
      return {
        productName: v.productName,
        supplier: v.lastSupplier,
        priceCents: v.lastPrice,
        quantity,
        cheapestPriceCents: cheapest?.priceCents ?? v.lastPrice,
        cheapestSupplier: cheapest?.supplier.name ?? v.lastSupplier,
      };
    }),
  );

  const fitted = fitBudget(base, budgetCents);

  return {
    components: [
      {
        type: 'procurement_plan_card',
        data: {
          title: 'Budget-optimized plan',
          lines: fitted.lines.map((l) => ({
            productId: undefined,
            productName: l.productName,
            typicalQuantity: l.quantity,
            unit: 'unit',
            supplier: l.supplier,
            priceCents: l.priceCents,
            swapped: l.swapped,
          })),
          totalCents: fitted.total,
          budgetCents,
          withinBudget: fitted.withinBudget,
          swaps: fitted.swaps,
          cheapestTotal: fitted.cheapestTotal,
          disclaimer: fitted.withinBudget
            ? 'Swapped to cheapest live offers where needed to fit budget.'
            : 'Budget below the cheapest achievable total. Showing all lines; consider raising the cap.',
        },
      },
    ],
    actions: [{ type: 'view_cart', label: 'Open cart', href: '/cart' }],
    rawSummary: { total: fitted.total, withinBudget: fitted.withinBudget, swapCount: fitted.swaps.length },
  };
}
