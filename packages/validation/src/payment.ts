import { z } from 'zod';

export const createPaymentSchema = z
  .object({
    purchaseOrderId: z.string().min(1),
    method: z.enum(['cash', 'bank_transfer', 'online']),
    transactionReference: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const confirmPaymentSchema = z
  .object({ status: z.enum(['confirmed', 'failed', 'refunded']), reason: z.string().max(500).optional() })
  .strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
