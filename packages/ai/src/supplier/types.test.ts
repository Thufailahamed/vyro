import { describe, it, expect } from 'vitest';
import {
  AiQuoteStrategySchema,
  AiQuoteDraftRequestSchema,
  AiQuoteDraftResponseSchema,
} from './types';

describe('Supplier AI Quote Schemas', () => {
  it('validates strategy enum', () => {
    expect(AiQuoteStrategySchema.safeParse('win_deal').success).toBe(true);
    expect(AiQuoteStrategySchema.safeParse('balanced').success).toBe(true);
    expect(AiQuoteStrategySchema.safeParse('premium_margin').success).toBe(true);
    expect(AiQuoteStrategySchema.safeParse('invalid_strategy').success).toBe(false);
  });

  it('validates quote draft request defaults', () => {
    const parsed = AiQuoteDraftRequestSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.strategy).toBe('balanced');
      expect(parsed.data.includeAlternatives).toBe(true);
    }
  });

  it('validates a complete quote draft response', () => {
    const validPayload = {
      draft: {
        deliveryFeeCents: 150000,
        validDays: 14,
        paymentTerms: 'Net 7 days from invoice',
        notes: 'We can deliver fresh stock within 48 hours.',
        summaryExplanation: 'Priced against catalog with 3% bulk volume discount.',
        strategyUsed: 'balanced' as const,
        items: [
          {
            rfqItemId: 'item-1',
            productId: 'prod-1',
            supplierProductId: 'sp-1',
            description: 'Samba Rice 50kg',
            quantity: 100,
            unit: 'kg',
            unitPriceCents: 38000,
            discountCents: 1140,
            subtotalCents: 3686000,
            isAlternative: false,
            rationale: 'Catalog price with volume discount applied.',
            stockStatus: 'in_stock' as const,
            tier: {
              minQty: 200,
              unitPriceCents: 36000,
            },
          },
        ],
      },
    };
    const parsed = AiQuoteDraftResponseSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });
});
