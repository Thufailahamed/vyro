import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/** price_watch: price movers over the trailing 28 days. */
export async function priceWatchHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const movers = await repos.priceChangeMovers({ businessId: ctx.businessId, sinceMs: Date.now() - 28 * DAY });
  const top = movers.slice(0, 8);
  return {
    components: [{ type: 'spend_summary_card', data: { movers: top, windowDays: 28 } }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { count: top.length },
  };
}
