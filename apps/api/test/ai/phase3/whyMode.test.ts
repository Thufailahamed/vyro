import { describe, it, expect } from 'vitest';
import { applyWhyMode } from '../../../src/modules/ai/intents/whyMode';

describe('applyWhyMode', () => {
  it('appends why_card to spend_summary result', async () => {
    const out = await applyWhyMode(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: {
          intent: 'spend_summary',
          slots: { whyRequested: true, period: 'month' } as any,
          confidence: 0.9,
        },
      },
      {
        components: [{ type: 'spend_summary_card', data: { period: 'month', totalCents: 1250000, orderCount: 5 } }],
        actions: [],
        rawSummary: { totalCents: 1250000, prevTotalCents: 1080000, topDriver: { productName: 'Chicken', pct: 22 }, period: 'month' },
      },
      {} as any,
    );
    expect(out.components.length).toBe(2);
    const why = out.components[1] as any;
    expect(why.type).toBe('why_card');
    expect(why.data.evidence.length).toBeGreaterThanOrEqual(2);
    expect(why.data.recommendation).toMatch(/chicken|supplier/i);
  });

  it('does nothing when whyRequested false', async () => {
    const out = await applyWhyMode(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: {
          intent: 'spend_summary',
          slots: {} as any,
          confidence: 0.9,
        },
      },
      { components: [{ type: 'spend_summary_card', data: {} }], actions: [], rawSummary: {} },
      {} as any,
    );
    expect(out.components).toHaveLength(1);
  });

  it('does nothing for non-analytics intents', async () => {
    const out = await applyWhyMode(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: {
          intent: 'find_cheapest',
          slots: { whyRequested: true } as any,
          confidence: 0.9,
        },
      },
      { components: [{ type: 'recommendation_card', data: {} }], actions: [], rawSummary: {} },
      {} as any,
    );
    expect(out.components).toHaveLength(1);
  });
});
