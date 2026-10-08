import { describe, expect, it } from 'vitest';
import { planDeterministicMatches } from '@vyro/ai';
import type { InvoiceData, PoItemInput } from '@vyro/ai';
import { resolveUnmatchedInvoiceLines } from '../../src/modules/reconciliation/aiLineMatcher';

const GOLDEN_MATCHES = [
  {
    source: 'BSM RCE 5K',
    candidates: [{ id: 'rice-5kg', name: 'Basmati Rice 5kg', unit: 'bag' }],
    modelCandidateId: 'rice-5kg',
    confidence: 0.98,
    alternativeConfidence: 0.12,
    expectedOverrideId: 'rice-5kg',
    expectedSuggestionId: null,
  },
  {
    source: 'WHT SGR 1KG',
    candidates: [{ id: 'sugar-1kg', name: 'White Sugar 1kg', unit: 'pack' }],
    modelCandidateId: 'sugar-1kg',
    confidence: 0.97,
    alternativeConfidence: 0.2,
    expectedOverrideId: 'sugar-1kg',
    expectedSuggestionId: null,
  },
  {
    source: 'MLK PDR 400G',
    candidates: [
      { id: 'milk-1kg', name: 'Milk Powder 1kg', unit: 'pack' },
      { id: 'milk-400g', name: 'Milk Powder 400g', unit: 'pack' },
    ],
    modelCandidateId: 'milk-400g',
    confidence: 0.98,
    alternativeConfidence: 0.12,
    expectedOverrideId: 'milk-400g',
    expectedSuggestionId: null,
  },
  {
    source: 'MLK PDR',
    candidates: [
      { id: 'milk-400g', name: 'Milk Powder 400g', unit: 'pack' },
      { id: 'milk-1kg', name: 'Milk Powder 1kg', unit: 'pack' },
    ],
    modelCandidateId: 'milk-400g',
    confidence: 0.78,
    alternativeConfidence: 0.74,
    expectedOverrideId: null,
    expectedSuggestionId: 'milk-400g',
  },
  {
    source: 'Forklift service fee',
    candidates: [{ id: 'rice-5kg', name: 'Basmati Rice 5kg', unit: 'bag' }],
    modelCandidateId: null,
    confidence: 0,
    alternativeConfidence: 0,
    expectedOverrideId: null,
    expectedSuggestionId: null,
  },
] as const;

describe('reconciliation line matching golden fixtures', () => {
  it.each(GOLDEN_MATCHES)('$source → expected candidate handling', async (fixture) => {
    const poItems: PoItemInput[] = fixture.candidates.map((candidate) => ({
      id: candidate.id,
      productNameSnapshot: candidate.name,
      unit: candidate.unit,
      quantity: 2,
      unitPriceCents: 100,
      lineTotalCents: 200,
    }));
    const invoice: InvoiceData = {
      totalCents: 200,
      items: [{ description: fixture.source, quantity: 2, unit: 'pack', unitPriceCents: 100, totalCents: 200 }],
    };
    const deterministicPlan = planDeterministicMatches(poItems, invoice.items);
    expect(deterministicPlan.unmatchedInvoiceIndexes).toEqual([0]);

    const aiResponse = {
      matches: [
        {
          invoiceItemIndex: 0,
          poItemId: fixture.modelCandidateId,
          confidence: fixture.confidence,
          alternativeConfidence: fixture.alternativeConfidence,
          reason: fixture.expectedSuggestionId
            ? 'Possible description match; verify product size.'
            : 'Description matches the supplied product candidate.',
        },
      ],
    };
    const env: any = {
      VYRO_AI_RECONCILE_MATCHING: 'true',
      VYRO_AI_RECONCILE_MODEL: '@cf/test/golden',
      AI: { run: async () => ({ response: JSON.stringify(aiResponse) }) },
    };

    const result = await resolveUnmatchedInvoiceLines(env, poItems, invoice, deterministicPlan);
    expect(result.overrides[0]?.poItemId ?? null).toBe(fixture.expectedOverrideId);
    expect(result.suggestions[0]?.poItemId ?? null).toBe(fixture.expectedSuggestionId);
  });
});
