import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const PERIOD_DAYS: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };

/**
 * spend_summary: total spend + order count for business within period.
 * Excludes cancelled POs. Clarifies if period missing.
 */
export async function spendSummaryHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const period = ctx.classify.slots.period;
  if (!period) {
    return {
      components: [{
        type: 'clarification_card',
        data: { question: 'Which period?', options: ['week', 'month', 'quarter', 'year'] },
      }],
      actions: [],
      rawSummary: {},
    };
  }
  const since = Date.now() - (PERIOD_DAYS[period] ?? 30) * 86400000;
  const agg = await repos.spendInPeriod({ businessId: ctx.businessId, sinceMs: since });
  return {
    components: [{
      type: 'spend_summary_card',
      data: { period, totalCents: agg.totalCents, orderCount: agg.orderCount, currency: 'LKR' },
    }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { totalCents: agg.totalCents, orderCount: agg.orderCount, period },
  };
}
