import { z } from 'zod';

export const adminRefundRejectBody = z
  .object({ reason: z.string().min(1).max(500) })
  .strict();

export const adminPayoutBatchCreateBody = z
  .object({
    note: z.string().max(500).optional(),
    supplierIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

export const adminInvoiceOverrideBody = z
  .object({ note: z.string().min(1).max(2000) })
  .strict();

export const adminChargebackResolveBody = z
  .object({
    notes: z.string().max(2000).optional(),
    refundId: z.string().min(1).optional(),
  })
  .strict();

export const adminLedgerSummaryQuery = z
  .object({
    from: z.coerce.number().int().optional(),
    to: z.coerce.number().int().optional(),
  })
  .strict();

export const adminRefundQueueQuery = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const adminPayoutBatchIdParam = z.object({ batchId: z.string().min(1) });
export const adminRefundIdParam = z.object({ id: z.string().min(1) });
export const adminChargebackIdParam = z.object({ id: z.string().min(1) });
export const adminInvoiceIdParam = z.object({ id: z.string().min(1) });
