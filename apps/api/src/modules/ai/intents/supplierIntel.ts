import { scoreSuppliers } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

/** supplier_intel: PO-lifecycle reliability + price/lead badges. Deterministic. */
export async function supplierIntelHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const lifecycle = await repos.supplierLifecycle({ businessId: ctx.businessId, sinceMs: Date.now() - 90 * DAY });
  if (!lifecycle.length) {
    return {
      components: [{ type: 'supplier_list_card', data: { suppliers: [], note: 'No supplier history in the last 90 days.' } }],
      actions: [],
      rawSummary: { count: 0 },
    };
  }
  const offersBySupplier = new Map<string, { minPrice: number; minLead: number }>();
  const liveOffers = await repos.listSupplierProducts({ active: true }).catch(() => []);
  for (const o of liveOffers) {
    const cur = offersBySupplier.get(o.supplierId) ?? { minPrice: Number.MAX_SAFE_INTEGER, minLead: Number.MAX_SAFE_INTEGER };
    offersBySupplier.set(o.supplierId, {
      minPrice: Math.min(cur.minPrice, o.priceCents),
      minLead: Math.min(cur.minLead, o.leadTimeDays),
    });
  }
  const scored = scoreSuppliers(lifecycle.map((l) => {
    const off = offersBySupplier.get(l.supplierId) ?? { minPrice: Number.MAX_SAFE_INTEGER, minLead: Number.MAX_SAFE_INTEGER };
    return { ...l, minPrice: off.minPrice, minLead: off.minLead };
  }));
  return {
    components: [{ type: 'supplier_list_card', data: { suppliers: scored, windowDays: 90 } }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { count: scored.length, best: scored[0]?.supplierName },
  };
}
