import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/**
 * usual_order: aggregate recent PO items by product, average quantity,
 * return a procurement plan with top N lines. Emits `procurement_plan_card`.
 */
export async function usualOrderHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const weeksBack = ctx.classify.slots.weeksBack ?? 8;
  const topN = ctx.classify.slots.topNProducts ?? 10;
  const since = Date.now() - weeksBack * 7 * DAY;
  const items = await repos.recentPoItemsForRecurrence({ businessId: ctx.businessId, sinceMs: since });
  const productNames = new Map<string, string>();
  for (const name of await repos.listProductNames(5000)) productNames.set(name.toLowerCase(), name);

  const agg = new Map<string, { productId: string; productName: string; totalQty: number; occurrences: number }>();
  for (const it of items) {
    const v = agg.get(it.productId) ?? {
      productId: it.productId,
      productName: productNames.get(it.productId.toLowerCase()) ?? '—',
      totalQty: 0,
      occurrences: 0,
    };
    v.totalQty += it.quantity;
    v.occurrences += 1;
    agg.set(it.productId, v);
  }

  const lines = [...agg.values()]
    .sort((a, b) => b.occurrences - a.occurrences || b.totalQty - a.totalQty)
    .slice(0, topN)
    .map((v) => ({
      productId: v.productId,
      productName: v.productName,
      typicalQuantity: Math.round(v.totalQty / Math.max(v.occurrences, 1)),
    }));

  return {
    components: [{
      type: 'procurement_plan_card',
      data: {
        title: 'Your usual order',
        lines,
        disclaimer: 'Quantities averaged from your recent orders. Edit before confirming.',
      },
    }],
    actions: [{ type: 'view_cart', label: 'Open cart', href: '/cart' }],
    rawSummary: { count: lines.length },
  };
}
