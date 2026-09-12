import { z } from 'zod';

export const InvoiceItemDataSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  unitPriceCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
});
export type InvoiceItemData = z.infer<typeof InvoiceItemDataSchema>;

export const InvoiceDataSchema = z.object({
  invoiceNumber: z.string().optional(),
  totalCents: z.number().int().min(0),
  items: z.array(InvoiceItemDataSchema).min(1),
});
export type InvoiceData = z.infer<typeof InvoiceDataSchema>;

export const ReconciliationRequestSchema = z
  .object({
    invoiceUploadId: z.string().optional(),
    invoiceData: InvoiceDataSchema.optional(),
  })
  .strict();
export type ReconciliationRequest = z.infer<typeof ReconciliationRequestSchema>;

export const ReconciliationLineStatusSchema = z.enum([
  'matched',
  'price_variance',
  'quantity_variance',
  'unexpected_item',
  'missing_item',
]);
export type ReconciliationLineStatus = z.infer<typeof ReconciliationLineStatusSchema>;

export const ReconciliationLineSchema = z.object({
  poItemId: z.string().optional(),
  description: z.string(),
  poQuantity: z.number().optional(),
  billedQuantity: z.number().optional(),
  poUnitPriceCents: z.number().int().optional(),
  billedUnitPriceCents: z.number().int().optional(),
  poTotalCents: z.number().int().optional(),
  billedTotalCents: z.number().int().optional(),
  status: ReconciliationLineStatusSchema,
  varianceCents: z.number().int(),
  discrepancyReason: z.string().optional(),
});
export type ReconciliationLine = z.infer<typeof ReconciliationLineSchema>;

export const ReconciliationOverallStatusSchema = z.enum([
  'perfect_match',
  'discrepancy_detected',
  'critical_mismatch',
]);
export type ReconciliationOverallStatus = z.infer<typeof ReconciliationOverallStatusSchema>;

export const RecommendedActionSchema = z.enum([
  'approve_payment',
  'request_amendment',
  'file_claim',
]);
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

export const ThreeWayReconciliationResultSchema = z.object({
  status: ReconciliationOverallStatusSchema,
  matchConfidence: z.number().min(0).max(1),
  poTotalCents: z.number().int().min(0),
  invoiceTotalCents: z.number().int().min(0),
  netDifferenceCents: z.number().int(),
  isDeliveryConfirmed: z.boolean(),
  summary: z.string().max(1000),
  recommendedAction: RecommendedActionSchema,
  draftClaimNote: z.string().max(2000).optional(),
  lines: z.array(ReconciliationLineSchema),
});
export type ThreeWayReconciliationResult = z.infer<typeof ThreeWayReconciliationResultSchema>;

export const ThreeWayReconciliationResponseSchema = z.object({
  reconciliation: ThreeWayReconciliationResultSchema,
});
export type ThreeWayReconciliationResponse = z.infer<typeof ThreeWayReconciliationResponseSchema>;

export const ReconciliationClaimRequestSchema = z
  .object({
    claimMessage: z.string().min(5).max(2000),
    discrepancyCents: z.number().int(),
    affectedLineItems: z.array(z.string()).min(1),
  })
  .strict();
export type ReconciliationClaimRequest = z.infer<typeof ReconciliationClaimRequestSchema>;

export interface PoItemInput {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface DeliveryInput {
  status: string;
  deliveredAt?: number | null;
  driverName?: string | null;
}

export interface MatcherInput {
  po: {
    id: string;
    poNumber: string;
    totalCents: number;
    subtotalCents: number;
    deliveryFeeCents: number;
    status: string;
  };
  poItems: PoItemInput[];
  delivery?: DeliveryInput | null;
  invoice: InvoiceData;
}
