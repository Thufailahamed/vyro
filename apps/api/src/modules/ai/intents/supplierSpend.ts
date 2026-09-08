import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const PERIOD_DAYS: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };

/**
 * supplier_spend: total spend with one supplier within period.
 */
export async function supplierSpendHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.supplierName ?? '').trim();
  const period = ctx.classify.slots.period ?? 'month';
  if (!name) {
    return {
      components: [{ type: 'clarification_card', data: { question: 'Which supplier?', options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const since = Date.now() - (PERIOD_DAYS[period] ?? 30) * 86400000;
  const totalCents = await repos.spendForSupplier({ businessId: ctx.businessId, sinceMs: since, supplierName: name });
  return {
    components: [{
      type: 'spend_summary_card',
      data: { scope: 'supplier', supplierName: name, period, totalCents },
    }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { totalCents, supplierName: name, period },
  };
}
