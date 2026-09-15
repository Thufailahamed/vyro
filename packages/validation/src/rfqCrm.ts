import { z } from 'zod';

export const tagSchema = z.enum(['hot', 'warm', 'cold']);

export const conversionStatusSchema = z.enum([
  'new',
  'contacted',
  'quoted',
  'won',
  'lost',
]);

export const leadsListQuerySchema = z.object({
  tag: tagSchema.optional(),
  status: conversionStatusSchema.optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const setTagSchema = z.object({
  tag: tagSchema.nullable(),
});

export const setStatusSchema = z.object({
  status: conversionStatusSchema,
});

export const addNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'note cannot be empty')
    .max(1000, 'note cannot exceed 1000 characters'),
});

export const leadRowSchema = z.object({
  id: z.string(),
  rfqId: z.string(),
  supplierId: z.string(),
  status: z.string(),
  invitedAt: z.number(),
  tag: tagSchema.nullable(),
  conversionStatus: conversionStatusSchema.nullable(),
  quotedAt: z.number().nullable(),
  orderId: z.string().nullable(),
  orderValueCents: z.number().nullable(),
});

export const leadNoteRowSchema = z.object({
  id: z.string(),
  rfqSupplierId: z.string(),
  body: z.string(),
  createdBy: z.string(),
  createdAt: z.number(),
});

export const crmSummarySchema = z.object({
  byTag: z.object({
    hot: z.number(),
    warm: z.number(),
    cold: z.number(),
    untagged: z.number(),
  }),
  byStatus: z.object({
    new: z.number(),
    contacted: z.number(),
    quoted: z.number(),
    won: z.number(),
    lost: z.number(),
  }),
  totals: z.object({
    leads: z.number(),
    conversionRate: z.number(),
  }),
});

export const leadsListResultSchema = z.object({
  leads: z.array(leadRowSchema),
  nextCursor: z.string().nullable(),
});

export type LeadsListQuery = z.infer<typeof leadsListQuerySchema>;
export type SetTagBody = z.infer<typeof setTagSchema>;
export type SetStatusBody = z.infer<typeof setStatusSchema>;
export type AddNoteBody = z.infer<typeof addNoteSchema>;
export type AddNoteInput = { body: string };
export type Tag = z.infer<typeof tagSchema>;
export type ConversionStatus = z.infer<typeof conversionStatusSchema>;
export type LeadRow = z.infer<typeof leadRowSchema>;
export type LeadNoteRow = z.infer<typeof leadNoteRowSchema>;
export type CrmSummary = z.infer<typeof crmSummarySchema>;
export type LeadsListResult = z.infer<typeof leadsListResultSchema>;

// Aliases used by web hooks for naming clarity (the API uses "tag"/"status"
// across the whole codebase; the supplier-facing UI reads better as LeadTag /
// LeadConversionStatus).
export type LeadTag = Tag;
export type LeadConversionStatus = ConversionStatus;