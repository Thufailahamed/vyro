import { mergeInsights } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/** insights_feed: ranked merge of movers + savings + reorder signals. */
export async function insightsFeedHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const limit = Math.min(Number((ctx.classify.slots as any).limit ?? 10), 20);
  const [moves, savings] = await Promise.all([
    repos.priceChangeMovers({ businessId: ctx.businessId, sinceMs: Date.now() - 28 * DAY }).catch(() => []),
    repos.savingsOpportunities({ businessId: ctx.businessId, sinceMs: Date.now() - 60 * DAY }).catch(() => []),
  ]);
  const insights = mergeInsights({
    moves: moves.map((m) => ({ productName: m.productName, pct: m.pct })),
    anomalies: [],
    savings: savings.map((s) => ({ productName: s.productName, savingCents: s.savingCents })),
  }).slice(0, limit);
  return {
    components: [{ type: 'spend_summary_card', data: { kind: 'insights', insights } }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { count: insights.length },
  };
}
