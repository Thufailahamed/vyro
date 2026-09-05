import { z } from 'zod';

export const createPaymentSchema = z
  .object({
    purchaseOrderId: z.string().min(1),
    method: z.enum(['cash', 'bank_transfer', 'online']),
    amountCents: z.number().int().positive().optional(), // defaults to PO outstanding
    transactionReference: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const confirmPaymentSchema = z
  .object({
    status: z.enum(['confirmed', 'failed']),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const createRefundSchema = z
  .object({
    amountCents: z.number().int().positive().optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const payoutGenerateSchema = z
  .object({
    supplierId: z.string().min(1),
    periodStart: z.number().int().positive(),
    periodEnd: z.number().int().positive(),
  })
  .strict()
  .refine((d) => d.periodEnd > d.periodStart, {
    message: 'periodEnd must be after periodStart',
  });

export const payoutMarkPaidSchema = z
  .object({ reference: z.string().max(200).optional() })
  .strict();

export const payoutMarkFailedSchema = z
  .object({ reason: z.string().min(1).max(500) })
  .strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type PayoutGenerateInput = z.infer<typeof payoutGenerateSchema>;
export type PayoutMarkPaidInput = z.infer<typeof payoutMarkPaidSchema>;
export type PayoutMarkFailedInput = z.infer<typeof payoutMarkFailedSchema>;
