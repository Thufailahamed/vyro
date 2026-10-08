import { z } from 'zod';

// AI product upload: supplier files staged for AI extraction. The API layer
// parses the base64 into bytes and stores the file in R2; validation here is
// the request contract only.

export const productUploadCreateSchema = z
  .object({
    supplierId: z.string().min(1),
    filename: z.string().min(1).max(120),
    contentType: z.enum([
      'text/csv',
      'text/tab-separated-values',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]),
    /** Single-file uploads only. Base64 of ≤ 7.5 MB binary → ≤ 10 MB string. */
    base64: z.string().min(8).max(10_000_000),
  })
  .strict();

/** Editable subset of a staged row (PATCH /product-uploads/:id/rows/:rowId). */
export const rowFieldsSchema = z.object({
  productName: z.string().min(1).max(200).optional(),
  supplierSku: z.string().max(80).nullish(),
  unit: z.string().max(20).nullish(),
  priceLkr: z.number().min(0).nullish(),
  minOrderQty: z.number().int().min(1).nullish(),
  leadTimeDays: z.number().int().min(0).nullish(),
  stockQty: z.number().int().min(0).nullish(),
  tier1MinQty: z.number().int().min(1).nullish(),
  tier1DiscountPct: z.number().int().min(0).max(100).nullish(),
  tier2MinQty: z.number().int().min(1).nullish(),
  tier2DiscountPct: z.number().int().min(0).max(100).nullish(),
  tier3MinQty: z.number().int().min(1).nullish(),
  tier3DiscountPct: z.number().int().min(0).max(100).nullish(),
});

export const productUploadRowPatchSchema = z
  .object({
    decision: z.enum(['accepted', 'edited', 'rejected']),
    edited: rowFieldsSchema.optional(),
  })
  .strict();

export const productUploadCommitSchema = z.object({}).strict();

export type ProductUploadCreateInput = z.infer<typeof productUploadCreateSchema>;
export type ProductUploadRowPatchInput = z.infer<typeof productUploadRowPatchSchema>;
export type RowFieldsInput = z.infer<typeof rowFieldsSchema>;
