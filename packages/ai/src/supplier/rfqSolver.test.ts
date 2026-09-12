import { describe, it, expect } from 'vitest';
import { solveQuoteDraft, MARGIN_FLOOR_FACTOR } from './rfqSolver';
import type { SolverInput } from './types';

const mockInput: SolverInput = {
  strategy: 'balanced',
  includeAlternatives: true,
  rfq: {
    id: 'rfq-1',
    rfqNumber: 'RFQ-2026-001',
    title: 'Monthly Restaurant Groceries',
    deliveryDistrict: 'Colombo',
    paymentTermsRequested: 'Net 15 days',
  },
  rfqItems: [
    {
      id: 'line-1',
      productId: 'p-rice',
      description: 'Samba Rice 50kg',
      quantity: 10,
      unit: 'bag',
      targetPriceCents: 12000,
    },
    {
      id: 'line-2',
      description: 'Bulk Sugar 50kg',
      quantity: 20,
      unit: 'bag',
      targetPriceCents: 15000,
    },
  ],
  catalogOffers: [
    {
      supplierProductId: 'sp-rice',
      productId: 'p-rice',
      name: 'Samba Rice 50kg',
      basePriceCents: 12500,
      availabilityStatus: 'in_stock',
      deliveryAvailable: true,
    },
    {
      supplierProductId: 'sp-sugar',
      productId: 'p-sugar',
      name: 'Bulk Sugar 50kg',
      basePriceCents: 16000,
      availabilityStatus: 'in_stock',
      deliveryAvailable: true,
    },
  ],
};

describe('solveQuoteDraft', () => {
  it('balanced strategy uses base catalog price and offers volume tier', () => {
    const res = solveQuoteDraft({ ...mockInput, strategy: 'balanced' });
    expect(res.items).toHaveLength(2);
    expect(res.items[0]!.unitPriceCents).toBe(12500);
    expect(res.items[0]!.stockStatus).toBe('in_stock');
    expect(res.items[0]!.tier).toBeDefined();
    expect(res.items[0]!.tier?.minQty).toBe(20);
    expect(res.items[0]!.tier?.unitPriceCents).toBeLessThan(12500);
  });

  it('win_deal undercuts buyer target price by 2%', () => {
    const res = solveQuoteDraft({ ...mockInput, strategy: 'win_deal' });
    // targetPriceCents is 12000. 12000 * 0.98 = 11760. Floor is 12500 * 0.88 = 11000.
    expect(res.items[0]!.unitPriceCents).toBe(12500);
    expect(res.items[0]!.discountCents).toBe(12500 - 11760);
    expect(res.items[0]!.subtotalCents).toBe(11760 * 10);
  });

  it('win_deal respects hard margin floor when target is unrealistically low', () => {
    const lowTargetInput: SolverInput = {
      ...mockInput,
      strategy: 'win_deal',
      rfqItems: [
        {
          id: 'line-1',
          productId: 'p-rice',
          description: 'Samba Rice 50kg',
          quantity: 10,
          unit: 'bag',
          targetPriceCents: 5000, // unrealistically low
        },
      ],
    };
    const res = solveQuoteDraft(lowTargetInput);
    const floorPrice = Math.round(12500 * MARGIN_FLOOR_FACTOR);
    const netUnitPrice = res.items[0]!.unitPriceCents - res.items[0]!.discountCents;
    expect(netUnitPrice).toBe(floorPrice);
    expect(res.items[0]!.rationale).toContain('Floor protection applied');
  });

  it('premium_margin adds 4% markup for priority fulfillment', () => {
    const res = solveQuoteDraft({ ...mockInput, strategy: 'premium_margin' });
    expect(res.items[0]!.unitPriceCents).toBe(Math.round(12500 * 1.04));
    expect(res.items[0]!.discountCents).toBe(0);
  });

  it('handles unmatched items safely without crashing', () => {
    const unmatchedInput: SolverInput = {
      ...mockInput,
      rfqItems: [
        {
          id: 'line-unmatched',
          description: 'Imported Truffle Oil 250ml',
          quantity: 1,
          unit: 'bottle',
        },
      ],
    };
    const res = solveQuoteDraft(unmatchedInput);
    expect(res.items[0]!.stockStatus).toBe('unmatched');
    expect(res.items[0]!.unitPriceCents).toBe(0);
    expect(res.unmatchedCount).toBe(1);
  });
});
