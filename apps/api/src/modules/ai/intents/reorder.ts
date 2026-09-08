import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;
const LOOKBACK_DAYS = 90;
const CADENCE_THRESHOLD_DAYS = 14;

/**
 * reorder: surface items whose last purchase is older than cadence threshold.
 * Emits `procurement_plan_card` with due lines.
 */
export async function reorderHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const since = Date.now() - LOOKBACK_DAYS * DAY;
  const items = await repos.recentPoItemsForReorder({ businessId: ctx.businessId, sinceMs: since });
  const productNames = new Map<string, string>();
  for (const name of await repos.listProductNames(5000)) productNames.set(name.toLowerCase(), name);

  const latest = new Map<string, { productId: string; productName: string; lastQty: number; lastCreatedAt: number }>();
  for (const it of items) {
    const cur = latest.get(it.productId);
    if (!cur || it.createdAt > cur.lastCreatedAt) {
      latest.set(it.productId, {
        productId: it.productId,
        productName: productNames.get(it.productId.toLowerCase()) ?? '—',
        lastQty: it.quantity,
        lastCreatedAt: it.createdAt,
      });
    }
  }

  const now = Date.now();
  const due = [...latest.values()].filter((v) => now - v.lastCreatedAt > CADENCE_THRESHOLD_DAYS * DAY);

  return {
    components: [{
      type: 'procurement_plan_card',
      data: {
        title: 'Suggested reorder',
        lines: due.map((v) => ({ productId: v.productId, productName: v.productName, typicalQuantity: v.lastQty })),
        disclaimer: 'Based on days since your last purchase. Inventory not consulted in MVP.',
      },
    }],
    actions: [{ type: 'view_cart', label: 'Open cart', href: '/cart' }],
    rawSummary: { count: due.length },
  };
}
