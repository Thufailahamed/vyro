import { describe, it, expect } from 'vitest';
import { matchThreeWayReconciliation, planDeterministicMatches } from './matcher';
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
  it('exposes deterministic pairs and unmatched invoice indexes', () => {
    const plan = planDeterministicMatches(baseInput.poItems, [
      baseInput.invoice.items[0]!,
      { ...baseInput.invoice.items[1]!, description: 'WHT SGR 50KG' },
    ]);

    expect(plan.matches).toEqual([
      { invoiceItemIndex: 0, poItemId: 'poi-1', confidence: 1, source: 'deterministic' },
    ]);
    expect(plan.unmatchedInvoiceIndexes).toEqual([1]);
    expect(plan.remainingPoItemIds).toEqual(['poi-2']);
  });

  it('uses an AI override only for its indexed invoice line', () => {
    const result = matchThreeWayReconciliation({
      ...baseInput,
      invoice: {
        ...baseInput.invoice,
        items: [
          { ...baseInput.invoice.items[0]!, description: 'Samba Rice 50kg' },
          { ...baseInput.invoice.items[1]!, description: 'WHT SGR 50KG' },
        ],
      },
      aiMatchOverrides: [
        { invoiceItemIndex: 1, poItemId: 'poi-2', confidence: 0.97, reason: 'Abbreviation and size match.' },
      ],
    });
    const sugar = result.lines.find((line) => line.poItemId === 'poi-2');
    expect(sugar?.status).toBe('matched');
    expect(sugar?.matchSource).toBe('ai');
    expect(sugar?.matchConfidence).toBe(0.97);
    expect(sugar?.matchExplanation).toBe('Abbreviation and size match.');
  });

  it('keeps deterministic matches when an override targets an already resolved line', () => {
    const result = matchThreeWayReconciliation({
      ...baseInput,
      aiMatchOverrides: [
        { invoiceItemIndex: 0, poItemId: 'poi-2', confidence: 0.99, reason: 'Conflicting override.' },
      ],
    });
    expect(result.lines.find((line) => line.poItemId === 'poi-1')?.matchSource).toBe('deterministic');
    expect(result.lines.find((line) => line.poItemId === 'poi-2')?.matchSource).toBe('deterministic');
  });

  it('cannot steal a PO item reserved for a later deterministic match', () => {
    const result = matchThreeWayReconciliation({
      ...baseInput,
      invoice: {
        ...baseInput.invoice,
        items: [
          { ...baseInput.invoice.items[0]!, description: 'Forklift fee' },
          { ...baseInput.invoice.items[1]!, description: 'White Sugar 50kg' },
        ],
      },
      aiMatchOverrides: [
        { invoiceItemIndex: 0, poItemId: 'poi-2', confidence: 0.99, reason: 'Incorrect competing match.' },
      ],
    });
    expect(result.lines[0]!.status).toBe('unexpected_item');
    expect(result.lines.find((line) => line.poItemId === 'poi-2')?.status).toBe('matched');
    expect(result.lines.find((line) => line.poItemId === 'poi-2')?.matchSource).toBe('deterministic');
  });

  it('reserves exact alias matches before running token-Jaccard', () => {
    const poItems = baseInput.poItems.map((item, index) => ({
      ...item,
      productId: index === 0 ? 'product-rice' : 'product-sugar',
    }));
    const result = matchThreeWayReconciliation({
      ...baseInput,
      poItems,
      invoice: {
        ...baseInput.invoice,
        items: [
          { ...baseInput.invoice.items[1]!, description: 'WHT SGR 50KG' },
          baseInput.invoice.items[0]!,
        ],
      },
      aliasMatchOverrides: [
        { invoiceItemIndex: 0, poItemId: 'poi-2', reason: 'Previously confirmed supplier alias.' },
      ],
    });

    expect(result.lines[0]?.poItemId).toBe('poi-2');
    expect(result.lines[0]?.matchSource).toBe('alias');
    expect(result.lines[0]?.matchConfidence).toBe(1);
    expect(result.lines[0]?.matchExplanation).toBe('Previously confirmed supplier alias.');
    expect(result.lines[1]?.poItemId).toBe('poi-1');
    expect(result.lines[1]?.matchSource).toBe('deterministic');
  });

  it('keeps a below-threshold AI candidate unmatched and surfaces it as a suggestion', () => {
    const result = matchThreeWayReconciliation({
      ...baseInput,
      invoice: {
        ...baseInput.invoice,
        items: [{ ...baseInput.invoice.items[0]!, description: 'BASM RCE 5K' }],
      },
      aiSuggestions: [
        { invoiceItemIndex: 0, poItemId: 'poi-1', productName: 'Samba Rice 50kg', confidence: 0.72, reason: 'Possible rice pack match.' },
      ],
    });
    const unexpected = result.lines.find((line) => line.status === 'unexpected_item');
    expect(unexpected?.poItemId).toBeUndefined();
    expect(unexpected?.aiSuggestion?.poItemId).toBe('poi-1');
    expect(result.lines.find((line) => line.status === 'missing_item')?.poItemId).toBe('poi-1');
  });

  it('does not allow AI overrides to assign one PO item twice', () => {
    const result = matchThreeWayReconciliation({
      ...baseInput,
      invoice: {
        ...baseInput.invoice,
        items: [
          { ...baseInput.invoice.items[0]!, description: 'RICE A' },
          { ...baseInput.invoice.items[1]!, description: 'RICE B' },
        ],
      },
      aiMatchOverrides: [
        { invoiceItemIndex: 0, poItemId: 'poi-1', confidence: 0.99, reason: 'Match A' },
        { invoiceItemIndex: 1, poItemId: 'poi-1', confidence: 0.98, reason: 'Match B' },
      ],
    });
    expect(result.lines.filter((line) => line.poItemId === 'poi-1')).toHaveLength(1);
    expect(result.lines.some((line) => line.status === 'unexpected_item')).toBe(true);
  });

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
