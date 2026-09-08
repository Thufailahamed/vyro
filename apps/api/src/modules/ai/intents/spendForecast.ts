import { forecastNextMonth } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

/** spend_forecast: 3-month moving average with low/high range. Labelled prediction. */
export async function spendForecastHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const monthly = await repos.monthlySpend({ businessId: ctx.businessId, months: 6 });
  const history = monthly.slice(-3);
  const { prediction, low, high } = forecastNextMonth(monthly);
  const topProducts = await repos.topProductsLast30d({ businessId: ctx.businessId, limit: 3 }).catch(() => []);
  return {
    components: [{
      type: 'spend_summary_card',
      data: {
        kind: 'forecast',
        history,
        prediction,
        low,
        high,
        label: 'prediction',
        contributors: topProducts,
        note: 'Prediction based on your last 3 months. Actual spend may vary.',
      },
    }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { prediction, low, high },
  };
}
