import { z } from 'zod';

export const createProductSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    categoryId: z.string().min(1),
    brand: z.string().max(120).optional(),
    unit: z.string().min(1).max(40),
    packSize: z.string().max(40).optional(),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    categoryId: z.string().min(1).optional(),
    brand: z.string().max(120).nullable().optional(),
    unit: z.string().min(1).max(40).optional(),
    packSize: z.string().max(40).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
