import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const PERIOD_DAYS: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };

/**
 * product_spend: total spend on a single product within period.
 */
export async function productSpendHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim();
  const period = ctx.classify.slots.period ?? 'month';
  if (!name) {
    return {
      components: [{ type: 'clarification_card', data: { question: 'Which product?', options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const since = Date.now() - (PERIOD_DAYS[period] ?? 30) * 86400000;
  const totalCents = await repos.spendForProduct({ businessId: ctx.businessId, sinceMs: since, productName: name });
  return {
    components: [{
      type: 'spend_summary_card',
      data: { scope: 'product', productName: name, period, totalCents },
    }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { totalCents, productName: name, period },
  };
}
