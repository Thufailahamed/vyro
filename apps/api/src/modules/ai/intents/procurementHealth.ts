import { procurementHealth } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/** procurement_health: transparent 0-100 score with subscore breakdown. */
export async function procurementHealthHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const since90 = Date.now() - 90 * DAY;
  const since60 = Date.now() - 60 * DAY;
  const [conc, savings, lifecycle, spend] = await Promise.all([
    repos.concentration({ businessId: ctx.businessId, sinceMs: since90 }),
    repos.savingsOpportunities({ businessId: ctx.businessId, sinceMs: since60 }),
    repos.supplierLifecycle({ businessId: ctx.businessId, sinceMs: since90 }),
    repos.spendInPeriod({ businessId: ctx.businessId, sinceMs: since60 }),
  ]);
  const maxShare = conc[0]?.share ?? 0;
  const savingsTotal = savings.reduce((s, o) => s + o.savingCents, 0);
  const savingsRatio = spend.totalCents ? savingsTotal / spend.totalCents : 0;
  const minAccept = lifecycle.length
    ? Math.min(...lifecycle.map((l) => (l.total ? l.accepted / l.total : 1)))
    : 1;
  const { score, subs } = procurementHealth({ maxShare, savingsRatio, minAccept, gapCV: 0.2 });
  return {
    components: [{
      type: 'spend_summary_card',
      data: {
        score, subs, maxShare, savingsRatio, minAccept,
        explanation: 'Based on supplier concentration, price competitiveness, and PO acceptance over the last 90 days.',
      },
    }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { score, subs },
  };
}
