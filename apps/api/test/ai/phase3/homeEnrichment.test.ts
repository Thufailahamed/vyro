import { describe, it, expect, vi } from 'vitest';
import { buildHomePayload } from '../../../src/modules/ai/home';

describe('buildHomePayload enriched', () => {
  it('includes healthScore with 5 subscores and concentrationRisk with alternative count', async () => {
    const repos = {
      priceChangeMovers: vi.fn(async () => []),
      savingsOpportunities: vi.fn(async () => []),
      monthlySpend: vi.fn(async () => [100, 100, 100]),
      concentration: vi.fn(async () => [{ supplierId: 's1', supplierName: 'A', share: 0.4 }]),
    } as any;
    const p = await buildHomePayload(repos, 'b1');
    expect(p.healthScore.score).toBeDefined();
    expect(p.healthScore.breakdown).toHaveProperty('concentration');
    expect(p.healthScore.breakdown).toHaveProperty('priceCompetitiveness');
    expect(p.healthScore.breakdown).toHaveProperty('deliveryReliability');
    expect(p.healthScore.breakdown).toHaveProperty('consistency');
    expect(p.healthScore.breakdown).toHaveProperty('savingsOpportunity');
    expect(p.concentrationRisk.alternativeCount).toBe(0);
  });

  it('flags high concentration risk above 0.5 share', async () => {
    const repos = {
      priceChangeMovers: vi.fn(async () => []),
      savingsOpportunities: vi.fn(async () => []),
      monthlySpend: vi.fn(async () => [100, 100]),
      concentration: vi.fn(async () => [{ supplierId: 's1', supplierName: 'A', share: 0.7 }]),
    } as any;
    const p = await buildHomePayload(repos, 'b1');
    expect(p.concentrationRisk.label).toBe('high');
    expect(p.concentrationRisk.topSupplierShare).toBeCloseTo(0.7);
  });

  it('labels moderate concentration between 0.3 and 0.5', async () => {
    const repos = {
      priceChangeMovers: vi.fn(async () => []),
      savingsOpportunities: vi.fn(async () => []),
      monthlySpend: vi.fn(async () => [100, 100, 100]),
      concentration: vi.fn(async () => [{ supplierId: 's1', supplierName: 'A', share: 0.35 }]),
    } as any;
    const p = await buildHomePayload(repos, 'b1');
    expect(p.concentrationRisk.label).toBe('moderate');
  });
});
