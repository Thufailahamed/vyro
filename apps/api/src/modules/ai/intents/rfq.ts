import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

/**
 * create_rfq: AI-assisted RFQ preparation. Grounded: resolves the named
 * product + cheapest relevant suppliers, then returns a confirmation card
 * the UI turns into POST /api/rfqs (user confirms — AI never creates alone).
 */
export async function createRfqHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const productName = (ctx.classify.slots.productName as string | undefined) ?? '';
  const quantity = Number(ctx.classify.slots.quantity ?? 0) || 0;
  const unit = (ctx.classify.slots.unit as string | undefined) ?? 'kg';
  const product = productName ? await repos.findProductByName(productName) : null;
  const offers = product ? (await repos.listOffersByProduct(product.id)).slice(0, 6) : [];
  const lines = offers.slice(0, 3).map((o) => ({ supplierId: o.supplierId, supplierName: o.supplier.name, priceCents: o.priceCents }));
  return {
    components: [{
      type: 'recommendation_card',
      data: {
        title: productName ? `RFQ draft: ${quantity || 'bulk'}${unit} ${productName}` : 'RFQ draft',
        lines: lines.map((l) => ({ supplierName: l.supplierName, priceCents: l.priceCents })),
        rfqDraft: { productName, quantity, unit, supplierIds: lines.map((l) => l.supplierId) },
        disclaimer: 'Review suppliers and confirm — nothing is sent until you approve.',
      },
    }],
    actions: [{ type: 'view_orders', label: 'Open RFQs', href: '/rfqs' }],
    rawSummary: { productName, quantity, unit, suppliers: lines.length },
  };
}

/**
 * compare_quotes: fetch verified RFQ comparison via RFQ service when an
 * rfqId slot is present; otherwise guide the user to pick an RFQ.
 */
export async function compareQuotesHandler(ctx: IntentContext, _repos: AiRepos): Promise<HandlerResult> {
  const rfqId = (ctx.classify.slots as Record<string, unknown>).rfqId as string | undefined;
  let summary = 'Pick an RFQ to compare its verified quotes.';
  let best: string | null = null;
  try {
    if (rfqId) {
      const { rfqService } = await import('../../rfqs/service');
      const s = await rfqService.aiSummary((ctx.env as { DB: D1Database }).DB, rfqId);
      summary = `${s.recommendation}\n${s.summary}`;
      best = s.bestQuoteId;
    }
  } catch { /* fall through to guidance */ }
  return {
    components: [{
      type: 'recommendation_card',
      data: { title: 'Quote comparison', lines: [], summary, bestQuoteId: best, disclaimer: 'Only verified quote data is used.' },
    }],
    actions: rfqId ? [{ type: 'view_orders', label: 'Open comparison', href: `/rfqs/${rfqId}/compare` }] : [{ type: 'view_orders', label: 'Open RFQs', href: '/rfqs' }],
    rawSummary: { rfqId: rfqId ?? null, bestQuoteId: best },
  };
}
