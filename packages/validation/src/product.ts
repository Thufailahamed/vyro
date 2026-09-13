import { z } from 'zod';

// HS code: 6-10 digits with optional dots. Stored as the supplier typed it
// (e.g. "0901.21") so customs/tariff lookups work with both forms.
const hsCodeRe = /^[0-9]{6,10}(\.[0-9]{0,4})?$/;
const iso2Re = /^[A-Z]{2}$/;

export const createProductSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    categoryId: z.string().min(1),
    brand: z.string().max(120).optional(),
    unit: z.string().min(1).max(40),
    packSize: z.string().max(40).optional(),
    // Cross-border trade — declared by supplier at product creation.
    hsCode: z.string().regex(hsCodeRe, 'HS code must be 6-10 digits, optional .suffix').optional(),
    countryOfOrigin: z.string().regex(iso2Re, 'Country of origin must be ISO-3166 alpha-2').optional(),
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
    hsCode: z.string().regex(hsCodeRe, 'HS code must be 6-10 digits, optional .suffix').nullable().optional(),
    countryOfOrigin: z.string().regex(iso2Re, 'Country of origin must be ISO-3166 alpha-2').nullable().optional(),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
