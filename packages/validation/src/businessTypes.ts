import { z } from 'zod';

export const businessTypeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});

export const businessTypesResponseSchema = z.object({
  types: z.array(businessTypeSchema),
});
