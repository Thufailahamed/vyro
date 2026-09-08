import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

/**
 * delivery_estimate: list live supplier offers for a product (or supplier),
 * sorted by shortest lead time. Emits `supplier_list_card`.
 */
export async function deliveryEstimateHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const name = (ctx.classify.slots.productName ?? '').trim();
  const supplier = (ctx.classify.slots.supplierName ?? '').trim();
  if (!name && !supplier) {
    return {
      components: [{ type: 'clarification_card', data: { question: 'Which product or supplier?', options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const list = await repos.listSupplierProducts({
    productName: name || undefined,
    supplierName: supplier || undefined,
    active: true,
  });
  if (name && !list.length) {
    return {
      components: [{ type: 'clarification_card', data: { question: `No match for "${name}".`, options: [] } }],
      actions: [],
      rawSummary: {},
    };
  }
  const sorted = (list as any[])
    .slice()
    .sort((a, b) => a.leadTimeDays - b.leadTimeDays)
    .map((r) => ({
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      leadTimeDays: r.leadTimeDays,
      deliveryAvailable: !!r.deliveryAvailable,
      deliveryRadiusKm: r.deliveryRadiusKm ?? null,
    }));
  return {
    components: [{ type: 'supplier_list_card', data: { title: 'Delivery estimates', suppliers: sorted } }],
    actions: sorted.slice(0, 3).map((s) => ({
      type: 'view_supplier' as const,
      label: `View ${s.supplierName}`,
      href: `/suppliers/${s.supplierId}`,
    })),
    rawSummary: { count: sorted.length },
  };
}
