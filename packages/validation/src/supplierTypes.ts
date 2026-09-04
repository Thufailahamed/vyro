import { z } from 'zod';

export const supplierTypeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});

export const supplierTypesResponseSchema = z.object({
  types: z.array(supplierTypeSchema),
});
