import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const PERIOD_DAYS: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };
const DAY = 86400000;

/**
 * price_changes: compute largest % movers between first and last unit price
 * the business paid per product within period. Emits `spend_summary_card`.
 */
export async function priceChangesHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const period = ctx.classify.slots.period ?? 'month';
  const since = Date.now() - (PERIOD_DAYS[period] ?? 30) * DAY;
  const movers = await repos.priceChangeMovers({ businessId: ctx.businessId, sinceMs: since });
  return {
    components: [{
      type: 'spend_summary_card',
      data: { scope: 'price_changes', period, movers },
    }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { movers: movers.length, period },
  };
}
