import { describe, it, expect, vi } from 'vitest';
import { evaluateInsightsForBusiness } from '../../../src/scheduled/aiInsights';

async function sha(obj: unknown): Promise<string> {
  const sorted = Object.keys(obj as object).sort();
  const text = JSON.stringify(obj, sorted);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const repos = {
  listActiveBusinessIds: vi.fn().mockResolvedValue(['biz-1']),
  priceChangeMovers: vi.fn().mockResolvedValue([{ productName: 'rice', from: 100, to: 80, pct: -20 }]),
  savingsOpportunities: vi.fn().mockResolvedValue([{ productName: 'oil', savingCents: 500000 }]),
  concentration: vi.fn().mockResolvedValue([{ supplierId: 'sup-1', supplierName: 'A', share: 0.7 }]),
};

function makeDispatcher() {
  return {
    notifyAiInsight: vi.fn().mockResolvedValue(undefined),
    listInsightEvents: vi.fn().mockResolvedValue([]),
    recordInsightEvent: vi.fn().mockResolvedValue(undefined),
  };
}

describe('evaluateInsightsForBusiness', () => {
  it('emits price_drop when pct ≥ threshold', async () => {
    const out = await evaluateInsightsForBusiness('biz-1', repos as any, makeDispatcher() as any);
    expect(out.map((i) => i.kind)).toContain('price_drop');
  });

  it('skips already-seen insight by payloadHash', async () => {
    const disp = makeDispatcher();
    // Compute real hashes that match the payloads the test repos produce.
    const priceHash = await sha({ productName: 'rice', from: 100, to: 80, pct: -20 });
    const savingsHash = await sha({ productName: 'oil', savingCents: 500000 });
    const concHash = await sha({ supplierId: 'sup-1', share: 0.7 });
    disp.listInsightEvents.mockResolvedValueOnce([
      { payloadHash: priceHash, kind: 'price_drop' as const },
      { payloadHash: savingsHash, kind: 'savings_opportunity' as const },
      { payloadHash: concHash, kind: 'concentration_risk' as const },
    ]);
    const out = await evaluateInsightsForBusiness('biz-1', repos as any, disp as any);
    expect(out).toEqual([]);
  });

  it('emits savings_opportunity when amount ≥ 5,000 cents', async () => {
    const out = await evaluateInsightsForBusiness('biz-1', repos as any, makeDispatcher() as any);
    expect(out.map((i) => i.kind)).toContain('savings_opportunity');
  });

  it('emits concentration_risk when share ≥ 0.6', async () => {
    const out = await evaluateInsightsForBusiness('biz-1', repos as any, makeDispatcher() as any);
    expect(out.map((i) => i.kind)).toContain('concentration_risk');
  });

  it('drops signals below thresholds', async () => {
    const weakRepos = {
      ...repos,
      priceChangeMovers: vi.fn().mockResolvedValue([{ productName: 'rice', from: 100, to: 98, pct: -2 }]),
      savingsOpportunities: vi.fn().mockResolvedValue([{ productName: 'oil', savingCents: 100 }]),
      concentration: vi.fn().mockResolvedValue([{ supplierId: 'sup-1', supplierName: 'A', share: 0.3 }]),
    };
    const out = await evaluateInsightsForBusiness('biz-1', weakRepos as any, makeDispatcher() as any);
    expect(out).toEqual([]);
  });
});
