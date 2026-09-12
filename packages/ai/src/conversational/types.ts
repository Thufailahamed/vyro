import { z } from 'zod';

export const ConversationalIntentSchema = z.enum([
  'order_draft',
  'price_inquiry',
  'reorder',
  'order_tracking',
  'help',
]);
export type ConversationalIntent = z.infer<typeof ConversationalIntentSchema>;

export const ConversationalChatRequestSchema = z
  .object({
    message: z.string().min(1).max(1000),
    businessId: z.string().optional(),
  })
  .strict();
export type ConversationalChatRequest = z.infer<typeof ConversationalChatRequestSchema>;

export const DraftItemSchema = z.object({
  productId: z.string(),
  supplierProductId: z.string(),
  productName: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  unitPriceCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  supplierId: z.string(),
  supplierName: z.string(),
});
export type DraftItem = z.infer<typeof DraftItemSchema>;

export const OrderDraftSchema = z.object({
  id: z.string(),
  totalCents: z.number().int().min(0),
  deliveryDateEstimate: z.string().optional(),
  items: z.array(DraftItemSchema),
});
export type OrderDraft = z.infer<typeof OrderDraftSchema>;

export const TrackingInfoSchema = z.object({
  poNumber: z.string(),
  status: z.string(),
  totalCents: z.number().int().min(0),
  driverName: z.string().optional(),
  deliveryAddress: z.string().optional(),
});
export type TrackingInfo = z.infer<typeof TrackingInfoSchema>;

export const ConversationalOrderResponseSchema = z.object({
  replyText: z.string(),
  intent: ConversationalIntentSchema,
  draft: OrderDraftSchema.optional(),
  trackingInfo: TrackingInfoSchema.optional(),
});
export type ConversationalOrderResponse = z.infer<typeof ConversationalOrderResponseSchema>;

export const ConversationalConfirmRequestSchema = z
  .object({
    draftId: z.string().min(1),
    businessId: z.string().min(1),
  })
  .strict();
export type ConversationalConfirmRequest = z.infer<typeof ConversationalConfirmRequestSchema>;

export interface ParsedItem {
  query: string;
  quantity: number;
  unit: string;
}

export interface ParsedOrderResult {
  intent: ConversationalIntent;
  items: ParsedItem[];
  locationCue?: string;
  timeCue?: string;
  poNumberQuery?: string;
}
