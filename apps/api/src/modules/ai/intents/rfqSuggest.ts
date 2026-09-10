import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

interface RfqSlots {
  rfqId?: string;
  quoteId?: string;
  targetTotalCents?: number;
}

/**
 * rfq_invite_suppliers: grounded supplier suggestion. Loads RFQ items,
 * pulls discovered suppliers from rfqService.discoverSuppliers, and asks
 * the business to confirm before the user POSTs /api/rfqs/:id/invite.
 */
export async function rfq_invite_suppliersHandler(ctx: IntentContext, _repos: AiRepos): Promise<HandlerResult> {
  const rfqId = (ctx.classify.slots as RfqSlots).rfqId;
  if (!rfqId) {
    return {
      components: [{ type: 'recommendation_card', data: { title: 'Pick an RFQ first', disclaimer: 'Tell me which RFQ you want to invite suppliers for.' } }],
      actions: [{ type: 'view_orders', label: 'Open RFQs', href: '/rfqs' }],
      rawSummary: { rfqId: null },
    };
  }
  try {
    const { rfqService } = await import('../../rfqs/service');
    const list = await rfqService.discoverSuppliers((ctx.env as { DB: D1Database }).DB, rfqId);
    const lines = list.slice(0, 5).map((s: { supplier: { name: string }; coverage: number; invited: boolean }) => ({
      supplierName: s.supplier.name,
      coverage: Math.round(s.coverage * 100),
      invited: s.invited,
    }));
    return {
      components: [{
        type: 'recommendation_card',
        data: {
          title: 'Suggested suppliers',
          lines,
          disclaimer: 'Only verified suppliers with relevant products. Nothing is invited until you press the button.',
        },
      }],
      actions: [{ type: 'view_orders', label: 'Open RFQ', href: `/rfqs/${rfqId}` }],
      rawSummary: { rfqId, suggested: lines.length },
    };
  } catch {
    return {
      components: [{ type: 'recommendation_card', data: { title: 'Supplier discovery unavailable', disclaimer: 'Try again from the RFQ page.' } }],
      actions: [{ type: 'view_orders', label: 'Open RFQ', href: `/rfqs/${rfqId}` }],
      rawSummary: { rfqId, error: true },
    };
  }
}

/**
 * rfq_negotiate: drafts a counter-offer message grounded in the actual
 * RFQ quantity/unit. Posts nothing — user approves from the card.
 */
export async function rfq_negotiateHandler(ctx: IntentContext, _repos: AiRepos): Promise<HandlerResult> {
  const slots = ctx.classify.slots as RfqSlots;
  if (!slots.rfqId || !slots.quoteId || !slots.targetTotalCents) {
    return {
      components: [{ type: 'recommendation_card', data: { title: 'Need more context', disclaimer: 'Provide rfqId, quoteId and targetTotalCents.' } }],
      actions: [{ type: 'view_orders', label: 'Open RFQs', href: '/rfqs' }],
      rawSummary: { drafted: false },
    };
  }
  try {
    const { rfqService } = await import('../../rfqs/service');
    const draft = rfqService.suggestNegotiation(slots.targetTotalCents, 1000, 'kg');
    return {
      components: [{
        type: 'recommendation_card',
        data: { title: 'Draft counter-offer', lines: [{ supplierName: 'Draft message', coverage: 0, draft }], disclaimer: 'AI does not send. You review and press Send.' },
      }],
      actions: [{ type: 'view_orders', label: 'Open quote', href: `/rfqs/${slots.rfqId}` }],
      rawSummary: { drafted: true, rfqId: slots.rfqId, quoteId: slots.quoteId },
    };
  } catch {
    return {
      components: [{ type: 'recommendation_card', data: { title: 'Negotiation draft failed' } }],
      actions: [{ type: 'view_orders', label: 'Open RFQ', href: `/rfqs/${slots.rfqId}` }],
      rawSummary: { drafted: false, error: true },
    };
  }
}

/**
 * rfq_recommend_quote: returns rfqService.aiSummary verdict and bestQuoteId.
 */
export async function rfq_recommend_quoteHandler(ctx: IntentContext, _repos: AiRepos): Promise<HandlerResult> {
  const rfqId = (ctx.classify.slots as RfqSlots).rfqId;
  if (!rfqId) {
    return {
      components: [{ type: 'recommendation_card', data: { title: 'Pick an RFQ to recommend' } }],
      actions: [{ type: 'view_orders', label: 'Open RFQs', href: '/rfqs' }],
      rawSummary: { rfqId: null },
    };
  }
  try {
    const { rfqService } = await import('../../rfqs/service');
    const s = await rfqService.aiSummary((ctx.env as { DB: D1Database }).DB, rfqId);
    return {
      components: [{
        type: 'recommendation_card',
        data: { title: 'Quote recommendation', recommendation: s.recommendation, summary: s.summary, bestQuoteId: s.bestQuoteId, disclaimer: 'Only verified quote data is used.' },
      }],
      actions: [{ type: 'view_orders', label: 'Open comparison', href: `/rfqs/${rfqId}/compare` }],
      rawSummary: { rfqId, bestQuoteId: s.bestQuoteId },
    };
  } catch {
    return {
      components: [{ type: 'recommendation_card', data: { title: 'Recommendation unavailable' } }],
      actions: [{ type: 'view_orders', label: 'Open RFQ', href: `/rfqs/${rfqId}` }],
      rawSummary: { rfqId, error: true },
    };
  }
}

/**
 * rfq_status: returns RFQ row + recent events as a human timeline.
 */
export async function rfq_statusHandler(ctx: IntentContext, _repos: AiRepos): Promise<HandlerResult> {
  const rfqId = (ctx.classify.slots as RfqSlots).rfqId;
  if (!rfqId) {
    return {
      components: [{ type: 'recommendation_card', data: { title: 'Pick an RFQ' } }],
      actions: [{ type: 'view_orders', label: 'Open RFQs', href: '/rfqs' }],
      rawSummary: { rfqId: null },
    };
  }
  try {
    const { rfqService } = await import('../../rfqs/service');
    const db = (ctx.env as { DB: D1Database }).DB;
    const cmp = await rfqService.compare(db, rfqId);
    return {
      components: [{
        type: 'recommendation_card',
        data: { title: 'RFQ status', lines: [], status: cmp.rfq.status, bestQuoteId: cmp.bestPriceQuoteId, disclaimer: 'Verified only.' },
      }],
      actions: [{ type: 'view_orders', label: 'Open RFQ', href: `/rfqs/${rfqId}` }],
      rawSummary: { rfqId, status: cmp.rfq.status },
    };
  } catch {
    return {
      components: [{ type: 'recommendation_card', data: { title: 'Status unavailable' } }],
      actions: [{ type: 'view_orders', label: 'Open RFQ', href: `/rfqs/${rfqId}` }],
      rawSummary: { rfqId, error: true },
    };
  }
}
