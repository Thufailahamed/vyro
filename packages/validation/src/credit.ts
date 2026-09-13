import { z } from 'zod';

export const creditTermsSchema = z.enum(['net14', 'net30']);
export type CreditTerms = z.infer<typeof creditTermsSchema>;

export const creditFacilityQuerySchema = z
  .object({ businessId: z.string().min(1) })
  .strict();

export const creditDrawdownListQuerySchema = z
  .object({
    businessId: z.string().min(1),
    status: z.enum(['active', 'repaid', 'overdue']).optional(),
  })
  .strict();

export const creditRepaySchema = z
  .object({
    amountCents: z.number().int().positive(),
    paymentId: z.string().min(1),
  })
  .strict();
export type CreditRepayInput = z.infer<typeof creditRepaySchema>;

export const creditBulkRepaySchema = z
  .object({
    businessId: z.string().min(1),
    amountCents: z.number().int().positive(),
    paymentId: z.string().min(1),
  })
  .strict();

export const adminCreditFacilityUpsertSchema = z
  .object({
    businessId: z.string().min(1),
    limitCents: z.number().int().nonnegative(),
    defaultTerms: creditTermsSchema.optional(),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
  })
  .strict();

export const adminCreditFacilityPatchSchema = z
  .object({
    limitCents: z.number().int().nonnegative().optional(),
    defaultTerms: creditTermsSchema.optional(),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
    reason: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine((d) => d.limitCents !== undefined || d.defaultTerms !== undefined || d.status !== undefined, {
    message: 'at least one field required',
  });
export type AdminCreditFacilityPatchInput = z.infer<typeof adminCreditFacilityPatchSchema>;

export const adminCreditListQuerySchema = z
  .object({
    status: z.enum(['active', 'suspended', 'closed']).optional(),
    q: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
