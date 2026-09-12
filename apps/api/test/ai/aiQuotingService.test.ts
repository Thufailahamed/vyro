import { describe, it, expect, vi } from 'vitest';
import { buildFallbackProposalNotes, buildSummaryExplanation } from '../../src/modules/rfqs/aiQuotingService';
import type { SolverOutput } from '@vyro/ai';

describe('aiQuotingService helpers', () => {
  it('buildFallbackProposalNotes generates polite B2B quotation cover text with substitutes', () => {
    const text = buildFallbackProposalNotes({
      rfqTitle: 'Weekly Produce',
      deliveryDistrict: 'Colombo',
      itemCount: 3,
      substitutesCount: 1,
      strategy: 'win_deal',
    });
    expect(text).toContain('Weekly Produce');
    expect(text).toContain('Colombo');
    expect(text).toContain('alternative item');
  });

  it('buildFallbackProposalNotes explains standard quote when no substitutes', () => {
    const text = buildFallbackProposalNotes({
      rfqTitle: 'Monthly Rice',
      deliveryDistrict: 'Kandy',
      itemCount: 2,
      substitutesCount: 0,
      strategy: 'balanced',
    });
    expect(text).toContain('Monthly Rice');
    expect(text).not.toContain('alternative item');
  });

  it('buildSummaryExplanation formats solver metrics concisely', () => {
    const mockSolver: SolverOutput = {
      items: [
        {
          rfqItemId: 'item-1',
          description: 'Samba Rice 50kg',
          quantity: 10,
          unit: 'bag',
          unitPriceCents: 12000,
          discountCents: 0,
          subtotalCents: 120000,
          isAlternative: false,
          rationale: 'Catalog rate',
          stockStatus: 'in_stock',
        },
      ],
      deliveryFeeCents: 150000,
      validDays: 14,
      paymentTerms: 'Net 7 days',
      strategy: 'balanced',
      substitutesCount: 0,
      matchedCount: 1,
      unmatchedCount: 0,
    };
    const summary = buildSummaryExplanation(mockSolver);
    expect(summary).toContain('Priced 1 line item(s)');
    expect(summary).toContain('balanced');
    expect(summary).toContain('1 catalog match(es)');
  });
});
