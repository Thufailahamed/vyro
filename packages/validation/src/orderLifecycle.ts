import { z } from 'zod';

const reason = z.string().trim().min(3).max(500);

/** POST /purchase-orders/:id/accept — supplier (partial) acceptance. */
export const partialAcceptSchema = z
  .object({
    lines: z
      .array(
        z.union([
          z.object({ itemId: z.string().min(1), quantity: z.number().int().min(0) }).strict(),
          z
            .object({
              itemId: z.string().min(1),
              unavailable: z.literal(true),
              reason: z.string().trim().max(300).optional(),
            })
            .strict(),
        ]),
      )
      .max(500)
      .default([]),
    note: z.string().max(500).optional(),
  })
  .strict();
export type PartialAcceptInput = z.infer<typeof partialAcceptSchema>;

/** POST /admin/disputes/:poId/resolve */
export const disputeResolveSchema = z
  .object({
    outcome: z.enum(['refund_business', 'release_supplier', 'partial']),
    /** Required for `partial`: amount refunded to the buyer; the rest is released. */
    amountCents: z.number().int().positive().optional(),
    note: z.string().max(500).optional(),
  })
  .strict()
  .refine((v) => v.outcome !== 'partial' || typeof v.amountCents === 'number', {
    message: 'amountCents is required for a partial resolution',
    path: ['amountCents'],
  });
export type DisputeResolveInput = z.infer<typeof disputeResolveSchema>;

export const RETURN_REASON_CODE_VALUES = ['damaged', 'wrong_item', 'short_shipped', 'quality', 'expired', 'other'] as const;

/** POST /purchase-orders/:id/returns */
export const returnCreateSchema = z
  .object({
    reasonCode: z.enum(RETURN_REASON_CODE_VALUES),
    reasonNote: z.string().trim().max(1000).optional(),
    lines: z
      .array(
        z
          .object({
            itemId: z.string().min(1),
            quantity: z.number().int().positive(),
            conditionNote: z.string().max(300).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export type ReturnCreateInput = z.infer<typeof returnCreateSchema>;

/** POST /returns/:id/approve */
export const returnApproveSchema = z
  .object({
    note: z.string().max(500).optional(),
    /** Optional per-line approved quantities (defaults to requested). */
    lines: z
      .array(z.object({ returnItemId: z.string().min(1), quantity: z.number().int().min(0) }).strict())
      .optional(),
  })
  .strict();

/** POST /returns/:id/reject and /cancel */
export const returnReasonSchema = z.object({ reason }).strict();

/** POST /returns/:id/receive */
export const returnReceiveSchema = z
  .object({
    note: z.string().max(500).optional(),
    lines: z
      .array(
        z
          .object({
            returnItemId: z.string().min(1),
            quantity: z.number().int().min(0),
            restock: z.boolean().optional(),
            conditionNote: z.string().max(300).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

/** PATCH /deliveries/:poId — tracking details (no status change). */
export const deliveryTrackingSchema = z
  .object({
    carrier: z.string().trim().max(80).nullable().optional(),
    trackingNumber: z.string().trim().max(120).nullable().optional(),
    trackingUrl: z.string().trim().url().max(500).nullable().optional(),
    recipientName: z.string().trim().max(120).nullable().optional(),
    podNote: z.string().trim().max(500).nullable().optional(),
    driverName: z.string().max(120).optional(),
    driverPhone: z.string().max(40).optional(),
    estimatedAt: z.number().int().nullable().optional(),
  })
  .strict();
export type DeliveryTrackingInput = z.infer<typeof deliveryTrackingSchema>;

/** Admin order-lifecycle settings (config section `order_lifecycle`). */
export const orderLifecycleConfigSchema = z
  .object({
    pendingAutoCancelHours: z.number().int().min(1).max(24 * 30),
    autoCompleteDays: z.number().int().min(1).max(60),
    disputeWindowDays: z.number().int().min(1).max(90),
    returnWindowDays: z.number().int().min(0).max(90),
    returnEscalationDays: z.number().int().min(1).max(30),
    paymentGateEnabled: z.boolean(),
    returnsEnabled: z.boolean(),
    automationEnabled: z.boolean(),
  })
  .partial()
  .strict();
