import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/**
 * usual_order: aggregate recent PO items by product, average quantity,
 * return a procurement plan with top N lines. Emits `procurement_plan_card`.
 *
 * When reorder cadence is stable (>=3 distinct purchases), surface a cadence
 * hint per line to help the buyer plan lead time.
 */
export async function usualOrderHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const weeksBack = ctx.classify.slots.weeksBack ?? 8;
  const topN = ctx.classify.slots.topNProducts ?? 10;
  const since = Date.now() - weeksBack * 7 * DAY;
  const items = await repos.recentPoItemsForRecurrence({ businessId: ctx.businessId, sinceMs: since });
  const nameById = await repos.productNamesByIds(items.map((i) => i.productId));

  const agg = new Map<string, { productId: string; productName: string; totalQty: number; occurrences: number }>();
  for (const it of items) {
    const v = agg.get(it.productId) ?? {
      productId: it.productId,
      productName: nameById.get(it.productId) ?? 'Unknown product',
      totalQty: 0,
      occurrences: 0,
    };
    v.totalQty += it.quantity;
    v.occurrences += 1;
    agg.set(it.productId, v);
  }

  const sorted = [...agg.values()]
    .sort((a, b) => b.occurrences - a.occurrences || b.totalQty - a.totalQty)
    .slice(0, topN);

  const lines = await Promise.all(
    sorted.map(async (v) => {
      const cadence = await repos.poItemCadence({ businessId: ctx.businessId, productId: v.productId, sinceMs: since });
      const typicalQuantity = Math.round(v.totalQty / Math.max(v.occurrences, 1));
      const line: { productId: string; productName: string; typicalQuantity: number; cadenceHint?: string } = {
        productId: v.productId,
        productName: v.productName,
        typicalQuantity,
      };
      if (cadence && cadence.count >= 3) {
        line.cadenceHint = `You order ${v.productName} every ${cadence.minIntervalDays}–${cadence.maxIntervalDays} days (avg ${cadence.avgIntervalDays})`;
      }
      return line;
    }),
  );

  return {
    components: [{
      type: 'procurement_plan_card',
      data: {
        title: 'Your usual order',
        lines,
        disclaimer: 'Quantities averaged from your recent orders. Cadence hints use your reorder history; edit before confirming.',
      },
    }],
    actions: [{ type: 'view_cart', label: 'Open cart', href: '/cart' }],
    rawSummary: { count: lines.length },
  };
}

