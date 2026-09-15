import { z } from 'zod';

export const repeatOfferSchema = z.object({
  supplierId: z.string(),
  supplierName: z.string(),
  percent: z.number().int().positive(),
  trailingSpendCents: z.number().int().nonnegative(),
});
export type RepeatOffer = z.infer<typeof repeatOfferSchema>;

export const repeatOfferPreviewResponseSchema = z.object({
  offers: z.array(repeatOfferSchema),
});
export type RepeatOfferPreviewResponse = z.infer<typeof repeatOfferPreviewResponseSchema>;

export const repeatOfferAppliedSchema = z.object({
  supplierId: z.string(),
  discountCents: z.number().int().nonnegative(),
  percent: z.number().int().positive(),
});
export type RepeatOfferApplied = z.infer<typeof repeatOfferAppliedSchema>;

export const repeatOfferAnalyticsResponseSchema = z.object({
  triggeredCount: z.number().int().nonnegative(),
  totalSavingsCents: z.number().int().nonnegative(),
  byRetailer: z.array(z.object({
    businessId: z.string(),
    trailingSpendCents: z.number().int().nonnegative(),
    triggeredAt: z.number().int().nonnegative(),
  })),
});
export type RepeatOfferAnalyticsResponse = z.infer<typeof repeatOfferAnalyticsResponseSchema>;
