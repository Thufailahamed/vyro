import { describe, it, expect } from 'vitest';
import { matchThreeWayReconciliation } from './matcher';
import type { MatcherInput } from './types';

const baseInput: MatcherInput = {
  po: {
    id: 'po-1',
    poNumber: 'PO-2026-001',
    subtotalCents: 250000,
    deliveryFeeCents: 25000,
    totalCents: 275000,
    status: 'delivered',
  },
  poItems: [
    {
      id: 'poi-1',
      productNameSnapshot: 'Samba Rice 50kg',
      quantity: 10,
      unitPriceCents: 15000,
      lineTotalCents: 150000,
    },
    {
      id: 'poi-2',
      productNameSnapshot: 'White Sugar 50kg',
      quantity: 5,
      unitPriceCents: 20000,
      lineTotalCents: 100000,
    },
  ],
  delivery: {
    status: 'delivered',
    deliveredAt: Date.now() - 3600000,
  },
  invoice: {
    invoiceNumber: 'INV-101',
    totalCents: 275000,
    items: [
      {
        description: 'Samba Rice 50kg',
        quantity: 10,
        unitPriceCents: 15000,
        totalCents: 150000,
      },
      {
        description: 'White Sugar 50kg',
        quantity: 5,
        unitPriceCents: 20000,
        totalCents: 100000,
      },
    ],
  },
};

describe('matchThreeWayReconciliation', () => {
  it('returns perfect_match when all lines and totals match exactly and delivery confirmed', () => {
    const res = matchThreeWayReconciliation(baseInput);
    expect(res.status).toBe('perfect_match');
    expect(res.netDifferenceCents).toBe(0);
    expect(res.isDeliveryConfirmed).toBe(true);
    expect(res.recommendedAction).toBe('approve_payment');
    expect(res.lines.every((l) => l.status === 'matched')).toBe(true);
  });

  it('detects price variance when billed unit price exceeds PO rate', () => {
    const priceVarianceInput: MatcherInput = {
      ...baseInput,
      invoice: {
        invoiceNumber: 'INV-102',
        totalCents: 285000,
        items: [
          {
            description: 'Samba Rice 50kg',
            quantity: 10,
            unitPriceCents: 16000, // +Rs. 10/unit
            totalCents: 160000,
          },
          {
            description: 'White Sugar 50kg',
            quantity: 5,
            unitPriceCents: 20000,
            totalCents: 100000,
          },
        ],
      },
    };
    const res = matchThreeWayReconciliation(priceVarianceInput);
    expect(res.status).toBe('discrepancy_detected');
    expect(res.netDifferenceCents).toBe(10000);
    expect(res.recommendedAction).toBe('request_amendment');
    const riceLine = res.lines.find((l) => l.poItemId === 'poi-1');
    expect(riceLine?.status).toBe('price_variance');
    expect(riceLine?.varianceCents).toBe(10000);
  });

  it('detects quantity variance when billed quantity exceeds PO quantity', () => {
    const qtyVarianceInput: MatcherInput = {
      ...baseInput,
      invoice: {
        invoiceNumber: 'INV-103',
        totalCents: 305000,
        items: [
          {
            description: 'Samba Rice 50kg',
            quantity: 12, // +2 bags
            unitPriceCents: 15000,
            totalCents: 180000,
          },
          {
            description: 'White Sugar 50kg',
            quantity: 5,
            unitPriceCents: 20000,
            totalCents: 100000,
          },
        ],
      },
    };
    const res = matchThreeWayReconciliation(qtyVarianceInput);
    expect(res.status).toBe('discrepancy_detected');
    const riceLine = res.lines.find((l) => l.poItemId === 'poi-1');
    expect(riceLine?.status).toBe('quantity_variance');
    expect(riceLine?.varianceCents).toBe(30000);
  });

  it('detects unexpected items billed on invoice that were not in PO', () => {
    const unexpectedInput: MatcherInput = {
      ...baseInput,
      invoice: {
        invoiceNumber: 'INV-104',
        totalCents: 305000,
        items: [
          ...baseInput.invoice.items,
          {
            description: 'Special Handling / Forklift Fee',
            quantity: 1,
            unitPriceCents: 30000,
            totalCents: 30000,
          },
        ],
      },
    };
    const res = matchThreeWayReconciliation(unexpectedInput);
    const extraLine = res.lines.find((l) => l.status === 'unexpected_item');
    expect(extraLine).toBeDefined();
    expect(extraLine?.description).toBe('Special Handling / Forklift Fee');
    expect(extraLine?.varianceCents).toBe(30000);
  });

  it('flags critical mismatch if delivery is unconfirmed', () => {
    const unconfirmedInput: MatcherInput = {
      ...baseInput,
      po: {
        ...baseInput.po,
        status: 'in_transit',
      },
      delivery: {
        status: 'in_transit',
        deliveredAt: null,
      },
    };
    const res = matchThreeWayReconciliation(unconfirmedInput);
    expect(res.isDeliveryConfirmed).toBe(false);
    expect(res.status).toBe('critical_mismatch');
    expect(res.recommendedAction).toBe('file_claim');
  });
});
