import { z } from 'zod';

export const createCategorySchema = z
  .object({
    slug: z.string().min(1).max(60),
    name: z.string().min(1).max(120),
    parentId: z.string().min(1).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
