import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/** category_intel: spend by category with top + savings opportunity. */
export async function categoryIntelHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const rows = await repos.categorySpend({ businessId: ctx.businessId, sinceMs: Date.now() - 90 * DAY });
  const sorted = [...rows].sort((a, b) => b.totalCents - a.totalCents);
  const savings = await repos.savingsOpportunities({ businessId: ctx.businessId, sinceMs: Date.now() - 60 * DAY }).catch(() => []);
  return {
    components: [{
      type: 'spend_summary_card',
      data: {
        kind: 'category',
        categories: sorted,
        top: sorted[0] ?? null,
        savingsOpportunities: savings.length,
        windowDays: 90,
      },
    }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { count: sorted.length, top: sorted[0]?.category },
  };
}
