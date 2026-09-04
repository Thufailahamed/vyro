import { z } from 'zod';

export const analyticsRange = z.union([z.literal('7d'), z.literal('30d'), z.literal('90d')]);

export const supplierAnalyticsQuery = z
  .object({
    supplierId: z.string().uuid().optional(),
    range: analyticsRange.optional(),
  })
  .strict();

export const adminAnalyticsQuery = z
  .object({
    range: analyticsRange.optional(),
  })
  .strict();
