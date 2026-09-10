import { describe, expect, it, vi } from 'vitest';

// Mock the rfqService before importing the handlers.
const discoverMock = vi.fn(async () => [
  { supplier: { name: 'Mill A', city: 'Colombo', district: 'Colombo' }, coverage: 0.8, productCount: 2, invited: false },
  { supplier: { name: 'Mill B', city: 'Kandy', district: 'Kandy' }, coverage: 0.6, productCount: 2, invited: true },
]);
const compareMock = vi.fn(async () => ({
  rfq: { id: 'r1', rfqNumber: 'RFQ-1', title: 't', currency: 'LKR', status: 'open' },
  items: [],
  quotes: [],
  bestPriceQuoteId: 'q1',
  fastestQuoteId: 'q1',
  splitOptimization: { perItemBest: [], splitItemsTotalCents: 0, supplierCount: 1 },
}));
const aiSummaryMock = vi.fn(async () => ({
  bestQuoteId: 'q1', lowestPriceQuoteId: 'q1', fastestQuoteId: 'q1',
  summary: '1. Mill A', recommendation: 'Mill A is best', splitSuggestion: null,
}));

vi.mock('../../src/modules/rfqs/service', () => ({
  rfqService: {
    discoverSuppliers: discoverMock,
    aiSummary: aiSummaryMock,
    compare: compareMock,
    suggestNegotiation: (_t: number, _q: number, _u: string) => 'draft message',
  },
}));

import {
  rfq_invite_suppliersHandler,
  rfq_negotiateHandler,
  rfq_recommend_quoteHandler,
  rfq_statusHandler,
} from '../../src/modules/ai/intents/rfqSuggest';

const baseCtx = {
  env: { DB: {} as unknown as D1Database },
  businessId: 'b1',
  userId: 'u1',
  classify: { intent: 'rfq_status', slots: { rfqId: 'r1', quoteId: 'q1', targetTotalCents: 100000 } },
};

describe('rfqSuggest intents', () => {
  it('rfq_invite_suppliers returns a recommendation_card', async () => {
    const res = await rfq_invite_suppliersHandler(baseCtx as never, {} as never);
    expect(res.components[0].type).toBe('recommendation_card');
    expect(res.actions[0]).toMatchObject({ type: 'view_orders' });
  });
  it('rfq_negotiate returns a draft message without posting', async () => {
    const res = await rfq_negotiateHandler(baseCtx as never, {} as never);
    expect(res.components[0].type).toBe('recommendation_card');
    expect(res.rawSummary).toMatchObject({ drafted: true });
  });
  it('rfq_recommend_quote returns recommendation card', async () => {
    const res = await rfq_recommend_quoteHandler(baseCtx as never, {} as never);
    expect(res.components[0].type).toBe('recommendation_card');
  });
  it('rfq_status returns a status card', async () => {
    const res = await rfq_statusHandler(baseCtx as never, {} as never);
    expect(res.components[0].type).toBe('recommendation_card');
  });
  it('rfq_invite_suppliers handles missing rfqId', async () => {
    const res = await rfq_invite_suppliersHandler({ ...baseCtx, classify: { ...baseCtx.classify, slots: {} } } as never, {} as never);
    expect(res.components[0].type).toBe('recommendation_card');
    expect(res.rawSummary).toMatchObject({ rfqId: null });
  });
});
