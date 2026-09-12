import { z } from 'zod';

export const AiQuoteStrategySchema = z.enum(['win_deal', 'balanced', 'premium_margin']);
export type AiQuoteStrategy = z.infer<typeof AiQuoteStrategySchema>;

export const AiQuoteDraftRequestSchema = z
  .object({
    strategy: AiQuoteStrategySchema.default('balanced'),
    includeAlternatives: z.boolean().default(true),
    targetMarginDeltaPct: z.number().min(-15).max(30).optional(),
  })
  .strict();
export type AiQuoteDraftRequest = z.infer<typeof AiQuoteDraftRequestSchema>;

export const QuoteItemDraftSchema = z.object({
  rfqItemId: z.string(),
  productId: z.string().optional(),
  supplierProductId: z.string().optional(),
  description: z.string(),
  quantity: z.number().int().positive(),
  unit: z.string(),
  unitPriceCents: z.number().int().min(0),
  discountCents: z.number().int().min(0),
  subtotalCents: z.number().int().min(0),
  isAlternative: z.boolean().default(false),
  alternativeForRfqItemId: z.string().optional(),
  notes: z.string().optional(),
  rationale: z.string(),
  stockStatus: z.enum(['in_stock', 'low', 'substitute', 'unmatched']),
  tier: z
    .object({
      minQty: z.number().int().positive(),
      unitPriceCents: z.number().int().positive(),
    })
    .optional(),
});
export type QuoteItemDraft = z.infer<typeof QuoteItemDraftSchema>;

export const AiQuoteDraftSchema = z.object({
  deliveryFeeCents: z.number().int().min(0),
  validDays: z.number().int().min(1).max(90),
  paymentTerms: z.string().min(1).max(100),
  notes: z.string().max(2000),
  summaryExplanation: z.string().max(1000),
  strategyUsed: AiQuoteStrategySchema,
  items: z.array(QuoteItemDraftSchema),
});
export type AiQuoteDraft = z.infer<typeof AiQuoteDraftSchema>;

export const AiQuoteDraftResponseSchema = z.object({
  draft: AiQuoteDraftSchema,
});
export type AiQuoteDraftResponse = z.infer<typeof AiQuoteDraftResponseSchema>;

export interface SolverCatalogOffer {
  supplierProductId: string;
  productId: string;
  name: string;
  category?: string | null;
  basePriceCents: number;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  deliveryAvailable: boolean;
  minOrderQuantity?: number | null;
}

export interface SolverRfqItem {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  targetPriceCents?: number | null;
  specifications?: string | null;
}

export interface SolverInput {
  strategy: AiQuoteStrategy;
  includeAlternatives: boolean;
  rfq: {
    id: string;
    rfqNumber: string;
    title: string;
    deliveryDistrict?: string | null;
    deliveryCity?: string | null;
    paymentTermsRequested?: string | null;
  };
  rfqItems: SolverRfqItem[];
  catalogOffers: SolverCatalogOffer[];
  supplierDeliveryFeeCents?: number;
}

export interface SolverOutput {
  items: QuoteItemDraft[];
  deliveryFeeCents: number;
  validDays: number;
  paymentTerms: string;
  strategy: AiQuoteStrategy;
  substitutesCount: number;
  matchedCount: number;
  unmatchedCount: number;
}
