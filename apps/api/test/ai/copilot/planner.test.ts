import { describe, expect, it, vi } from 'vitest';
import { procurementPlanHandler } from '../../../src/modules/ai/intents/procurementPlan';
import { budgetOptimizeHandler } from '../../../src/modules/ai/intents/budgetOptimize';

const baseRepos = () => ({
  recentPoItemsForRecurrence: vi.fn(async () => [
    { productId: 'p1', supplierId: 's1', quantity: 2, unitPriceCents: 500000, createdAt: Date.now() - 7 * 86400000 },
    { productId: 'p1', supplierId: 's1', quantity: 2, unitPriceCents: 510000, createdAt: Date.now() - 14 * 86400000 },
    { productId: 'p2', supplierId: 's1', quantity: 1, unitPriceCents: 300000, createdAt: Date.now() - 7 * 86400000 },
  ]),
  productNamesByIds: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, id === 'p1' ? 'Rice' : 'Oil'] as const))),
  listOffersByProduct: vi.fn(async (productId: string) =>
    productId === 'p1'
      ? [{ priceCents: 420000, leadTimeDays: 3, availabilityStatus: 'in_stock', supplier: { id: 's2', name: 'Cheap Rice Co' } }]
      : [{ priceCents: 280000, leadTimeDays: 2, availabilityStatus: 'in_stock', supplier: { id: 's3', name: 'Oil Plus' } }],
  ),
});

describe('procurementPlanHandler', () => {
  it('emits procurement_plan_card with priced lines', async () => {
    const r = await procurementPlanHandler(
      { businessId: 'b1', classify: { intent: 'procurement_plan', slots: { weeksBack: 8, topNProducts: 10 }, confidence: 0.7 } } as any,
      baseRepos() as any,
    );
    expect(r.components[0]?.type).toBe('procurement_plan_card');
    const data: any = (r.components[0] as any).data;
    expect(data.lines.length).toBeGreaterThan(0);
    expect(data.totalCents).toBeGreaterThan(0);
  });
});

describe('budgetOptimizeHandler', () => {
  it('clarifies when no budgetCents', async () => {
    const r = await budgetOptimizeHandler(
      { businessId: 'b1', classify: { intent: 'budget_optimize', slots: {}, confidence: 0.7 } } as any,
      baseRepos() as any,
    );
    expect(r.components[0]?.type).toBe('clarification_card');
  });

  it('fits within budget by swapping to cheaper offers', async () => {
    const r = await budgetOptimizeHandler(
      { businessId: 'b1', classify: { intent: 'budget_optimize', slots: { budgetCents: 1200000 }, confidence: 0.7 } } as any,
      baseRepos() as any,
    );
    expect(r.components[0]?.type).toBe('procurement_plan_card');
    const data: any = (r.components[0] as any).data;
    expect(data.budgetCents).toBe(1200000);
    expect(data.withinBudget).toBe(true);
    expect(data.swaps.length).toBeGreaterThan(0);
  });

  it('reports impossibility when cap below cheapest total', async () => {
    const r = await budgetOptimizeHandler(
      { businessId: 'b1', classify: { intent: 'budget_optimize', slots: { budgetCents: 100 }, confidence: 0.7 } } as any,
      baseRepos() as any,
    );
    expect(r.components[0]?.type).toBe('procurement_plan_card');
    const data: any = (r.components[0] as any).data;
    expect(data.withinBudget).toBe(false);
    expect(data.lines.length).toBeGreaterThan(0);
    expect(data.cheapestTotal).toBeGreaterThan(0);
  });
});
