import { describe, it, expect, vi } from 'vitest';
import { simulateSupplierSwitchHandler } from '../../../src/modules/ai/intents/simulateSupplierSwitch';

const repos = {
  findProductByName: vi.fn(async (name: string) => (name === 'Rice' ? { id: 'p1', name: 'Rice' } : null)),
  listOffersByProduct: vi.fn(async () => [
    { supplier: { id: 's1', name: 'Current' }, priceCents: 500000, leadTimeDays: 3, availabilityStatus: 'in_stock', minOrderQty: 1 },
    { supplier: { id: 's2', name: 'Alt' }, priceCents: 420000, leadTimeDays: 4, availabilityStatus: 'in_stock', minOrderQty: 1 },
  ]),
  poItemCadence: vi.fn(async () => ({ avgIntervalDays: 7, stddevDays: 1, count: 8, minIntervalDays: 6, maxIntervalDays: 9 })),
};

describe('simulateSupplierSwitchHandler', () => {
  it('emits simulation_card with monthly+annual deltas', async () => {
    const r = await simulateSupplierSwitchHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: {
          intent: 'simulate_supplier_switch',
          slots: { productName: 'Rice', fromSupplierName: 'Current', toSupplierName: 'Alt' } as any,
          confidence: 0.7,
        },
      },
      repos as any,
    );
    expect(r.components[0]?.type).toBe('simulation_card');
    const d: any = (r.components[0] as any).data;
    expect(d.productName).toBe('Rice');
    expect(d.monthlyDeltaCents).toBeLessThan(0);
    expect(d.annualDeltaCents).toBe(d.monthlyDeltaCents * 12);
  });

  it('clarifies when product unknown', async () => {
    const r = await simulateSupplierSwitchHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: {
          intent: 'simulate_supplier_switch',
          slots: { productName: 'Unicorn' } as any,
          confidence: 0.7,
        },
      },
      {
        findProductByName: vi.fn(async () => null),
        listOffersByProduct: vi.fn(),
        poItemCadence: vi.fn(),
      } as any,
    );
    expect(r.components[0]?.type).toBe('clarification_card');
  });
});
