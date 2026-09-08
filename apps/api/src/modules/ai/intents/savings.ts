import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const WINDOW_DAYS = 60;
const DAY = 86400000;

/**
 * savings: find products where the business's recent paid price exceeds
 * a current cheaper live offer. Emits `savings_card` with disclaimer.
 */
export async function savingsHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const since = Date.now() - WINDOW_DAYS * DAY;
  const opportunities = await repos.savingsOpportunities({ businessId: ctx.businessId, sinceMs: since });
  return {
    components: [{
      type: 'savings_card',
      data: {
        opportunities,
        disclaimer: 'Estimated potential savings based on price differences vs. offers currently available. Confirm delivery feasibility before switching suppliers.',
      },
    }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { count: opportunities.length },
  };
}
