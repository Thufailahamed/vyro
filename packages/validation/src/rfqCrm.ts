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

export type LeadsListQuery = z.infer<typeof leadsListQuerySchema>;
export type SetTagBody = z.infer<typeof setTagSchema>;
export type SetStatusBody = z.infer<typeof setStatusSchema>;
export type AddNoteBody = z.infer<typeof addNoteSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type ConversionStatus = z.infer<typeof conversionStatusSchema>;