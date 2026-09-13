import { z } from 'zod';

export const adminProductListQuery = z
  .object({
    q: z.string().min(1).max(120).optional(),
    categoryId: z.string().min(1).optional(),
    supplierId: z.string().min(1).optional(),
    active: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    featured: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const adminHsCode = z
  .string()
  .regex(/^[0-9]{6,10}(\.[0-9]{0,4})?$/, 'HS code must be 6-10 digits, optional .suffix')
  .nullable()
  .optional();
const adminIso2 = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Country of origin must be ISO-3166 alpha-2')
  .nullable()
  .optional();

export const adminProductPatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    categoryId: z.string().min(1).optional(),
    brand: z.string().max(120).nullable().optional(),
    unit: z.string().min(1).max(20).optional(),
    packSize: z.string().max(40).nullable().optional(),
    active: z.boolean().optional(),
    featured: z.boolean().optional(),
    moderationNotes: z.string().max(2000).nullable().optional(),
    expectedUpdatedAt: z.number().int().optional(),
    hsCode: adminHsCode,
    countryOfOrigin: adminIso2,
  })
  .strict();

export const adminProductIdParam = z.object({ id: z.string().min(1) });

export const adminCategoryCreateBody = z
  .object({
    slug: z.string().min(1).max(60),
    name: z.string().min(1).max(120),
    parentId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .strict();

export const adminCategoryUpdateBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    parentId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const adminCategoryIdParam = z.object({ id: z.string().min(1) });

export const adminBusinessTypeCreateBody = z
  .object({
    slug: z.string().min(1).max(60),
    name: z.string().min(1).max(120),
  })
  .strict();

export const adminBusinessTypeUpdateBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const adminBusinessTypeIdParam = z.object({ id: z.string().min(1) });

export type AdminProductListQuery = z.infer<typeof adminProductListQuery>;
export type AdminProductPatchBody = z.infer<typeof adminProductPatchBody>;
export type AdminCategoryCreateBody = z.infer<typeof adminCategoryCreateBody>;
export type AdminCategoryUpdateBody = z.infer<typeof adminCategoryUpdateBody>;
export type AdminBusinessTypeCreateBody = z.infer<typeof adminBusinessTypeCreateBody>;
export type AdminBusinessTypeUpdateBody = z.infer<typeof adminBusinessTypeUpdateBody>;
