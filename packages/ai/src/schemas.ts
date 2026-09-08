import { z } from 'zod';

export const INTENT_NAMES = [
  'search_products',
  'find_cheapest',
  'compare_suppliers',
  'supplier_recommend',
  'spend_summary',
  'product_spend',
  'supplier_spend',
  'savings',
  'usual_order',
  'reorder',
  'price_changes',
  'delivery_estimate',
  'clarify',
] as const;

export type IntentName = (typeof INTENT_NAMES)[number];

export const PeriodSchema = z.enum(['week', 'month', 'quarter', 'year']);
export type Period = z.infer<typeof PeriodSchema>;

export const OptimizeForSchema = z.enum(['price', 'speed', 'reliability']);
export type OptimizeFor = z.infer<typeof OptimizeForSchema>;

// Per-intent slot schemas (kept loose; orchestrator normalizes).
const Slots = z.object({
  // search / find / compare / recommend
  query: z.string().min(1).max(120).optional(),
  productName: z.string().min(1).max(120).optional(),
  supplierName: z.string().min(1).max(120).optional(),
  quantity: z.number().int().min(1).max(100000).optional(),
  unit: z.string().min(1).max(20).optional(),
  topN: z.number().int().min(1).max(20).optional(),
  optimizeFor: OptimizeForSchema.optional(),
  // spend / savings / price-changes
  period: PeriodSchema.optional(),
  scope: z.enum(['business', 'category', 'supplier', 'product']).optional(),
  // usual_order
  weeksBack: z.number().int().min(1).max(52).optional(),
  topNProducts: z.number().int().min(1).max(50).optional(),
  // clarify
  question: z.string().max(280).optional(),
  options: z.array(z.string().min(1).max(80)).max(4).optional(),
}).strict();

export type SlotsByIntent = z.infer<typeof Slots>;

export const ClassifyResultSchema = z
  .object({
    intent: z.enum(INTENT_NAMES),
    slots: Slots,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

// Streaming event envelopes (server-emitted, client-consumed).
export const StatusEventSchema = z.object({ stage: z.string() }).strict();
export const ToolCallEventSchema = z
  .object({
    name: z.string(),
    slots: Slots,
    /** Human-readable label for the timeline UI. Optional for back-compat. */
    label: z.string().max(80).optional(),
    /** Epoch ms when the tool started. Optional. */
    startedAt: z.number().int().nonnegative().optional(),
  })
  .strict();
export const ToolResultEventSchema = z
  .object({
    name: z.string(),
    ok: z.boolean(),
    summary: z.string().max(200),
    label: z.string().max(80).optional(),
    /** How long the handler ran. Optional. */
    durationMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export const ComponentTypes = [
  'recommendation_card',
  'savings_card',
  'procurement_plan_card',
  'supplier_list_card',
  'spend_summary_card',
  'clarification_card',
  'confirmation_card',
] as const;

export const ConfirmationItemSchema = z
  .object({
    product: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(100000),
    unit: z.string().min(1).max(20),
    priceCents: z.number().int().min(0),
    supplier: z.string().min(1).max(120),
  })
  .strict();

export const ConfirmationCardDataSchema = z
  .object({
    items: z.array(ConfirmationItemSchema).min(1).max(50),
    totalCents: z.number().int().min(0),
    estimatedDelivery: z.string().min(1).max(120),
    idempotencyKey: z.string().min(1).max(120),
    poRef: z.string().min(1).max(80).optional(),
    confirmed: z.boolean().optional(),
  })
  .strict();

export const ComponentEnvelopeSchema = z
  .object({
    type: z.enum(ComponentTypes),
    data: z.record(z.unknown()),
  })
  .strict();

export const ActionSchema = z
  .object({
    type: z.enum([
      'view_search',
      'view_supplier',
      'view_product',
      'view_cart',
      'view_orders',
      'view_analytics',
    ]),
    label: z.string().min(1).max(80),
    href: z.string().min(1).max(500),
  })
  .strict();

export const FinalEventSchema = z
  .object({
    summary: z.string().min(1).max(800),
    actions: z.array(ActionSchema).max(6),
  })
  .strict();

export const ErrorEventSchema = z
  .object({ code: z.string().min(1).max(40), message: z.string().min(1).max(200) })
  .strict();

export const MetaEventSchema = z
  .object({
    provider: z.string().min(1).max(80),
    model: z.string().min(1).max(120),
    latencyMs: z.number().int().nonnegative(),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    intent: z.string().min(1).max(80),
  })
  .strict();

export type MetaEvent = z.infer<typeof MetaEventSchema>;

export type ComponentEnvelope = z.infer<typeof ComponentEnvelopeSchema>;
export type FinalEvent = z.infer<typeof FinalEventSchema>;
export type Action = z.infer<typeof ActionSchema>;
