import { z } from 'zod';

export const surfaceSchema = z.enum(['search', 'category', 'homepage', 'storefront']);
export const sponsorEventTypeSchema = z.enum(['impression', 'click']);
export const sponsorTierSchema = z.enum(['bronze', 'silver', 'gold']);
export const campaignStatusSchema = z.enum([
  'pending_approval',
  'pending_payment',
  'approved',
  'live',
  'expired',
  'rejected',
  'revoked',
  'cancelled',
]);
export const invoiceStatusSchema = z.enum(['pending', 'paid', 'waived']);
export const subscriptionStatusSchema = z.enum(['active', 'expired', 'cancelled']);

export const slotResolveQuerySchema = z.object({
  surface: surfaceSchema,
  categoryId: z.string().nullable().optional(),
});

export const createCampaignSchema = z
  .object({
    slotId: z.string().min(1),
    productId: z.string().min(1),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

export const updateCampaignSchema = z
  .object({
    startsAt: z.number().int().positive().optional(),
    endsAt: z.number().int().positive().optional(),
  })
  .refine(
    (v) => v.startsAt === undefined || v.endsAt === undefined || v.endsAt > v.startsAt,
    { message: 'endsAt must be after startsAt', path: ['endsAt'] },
  );

export const subscribePlanSchema = z.object({
  planId: z.string().min(1),
});

export const sponsorEventSchema = z.object({
  campaignId: z.string().min(1),
  eventType: sponsorEventTypeSchema,
  surface: surfaceSchema,
  requestId: z.string().min(8).max(128),
});

export const adminSlotUpsertSchema = z.object({
  surface: surfaceSchema,
  position: z.number().int().min(0).max(50),
  categoryId: z.string().nullable().optional(),
  label: z.string().min(1).max(200),
  dailyRateCents: z.number().int().min(0),
  active: z.boolean(),
});

export const adminPlanUpsertSchema = z.object({
  tier: sponsorTierSchema,
  name: z.string().min(1).max(120),
  monthlyRateCents: z.number().int().min(0),
  includedSlotCredits: z.number().int().min(0),
  active: z.boolean(),
});

export const adminApproveSchema = z.object({
  adminNotes: z.string().max(1000).optional(),
});

export const adminRejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const adminRevokeSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const sponsorSlotSchema = z.object({
  id: z.string(),
  surface: surfaceSchema,
  position: z.number().int(),
  categoryId: z.string().nullable(),
  label: z.string(),
  dailyRateCents: z.number().int(),
  active: z.boolean(),
});

export const sponsorCampaignSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  slotId: z.string(),
  productId: z.string(),
  startsAt: z.number().int(),
  endsAt: z.number().int(),
  status: campaignStatusSchema,
  paymentInvoiceId: z.string().nullable(),
  adminNotes: z.string().nullable(),
  pinned: z.boolean(),
  createdAt: z.number().int(),
});

export const sponsorInvoiceSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  amountCents: z.number().int(),
  status: invoiceStatusSchema,
  createdAt: z.number().int(),
  paidAt: z.number().int().nullable(),
});

export const sponsorPlanSchema = z.object({
  id: z.string(),
  tier: sponsorTierSchema,
  name: z.string(),
  monthlyRateCents: z.number().int(),
  includedSlotCredits: z.number().int(),
  active: z.boolean(),
});

export const sponsorSubscriptionSchema = z.object({
  id: z.string(),
  planId: z.string(),
  startsAt: z.number().int(),
  endsAt: z.number().int(),
  status: subscriptionStatusSchema,
  slotCreditsRemaining: z.number().int(),
});

export const sponsorDisclosureSchema = z.object({
  version: z.string(),
  title: z.string(),
  body: z.string(),
  lastUpdated: z.number().int(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type SponsorEventInput = z.infer<typeof sponsorEventSchema>;
export type AdminSlotUpsertInput = z.infer<typeof adminSlotUpsertSchema>;
export type AdminPlanUpsertInput = z.infer<typeof adminPlanUpsertSchema>;
export type SponsorSlot = z.infer<typeof sponsorSlotSchema>;
export type SponsorCampaign = z.infer<typeof sponsorCampaignSchema>;
export type SponsorInvoice = z.infer<typeof sponsorInvoiceSchema>;
export type SponsorPlan = z.infer<typeof sponsorPlanSchema>;
export type SponsorSubscription = z.infer<typeof sponsorSubscriptionSchema>;
export type SponsorDisclosure = z.infer<typeof sponsorDisclosureSchema>;