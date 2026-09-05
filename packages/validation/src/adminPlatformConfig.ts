import { z } from 'zod';

export const adminFeatureFlagsUpdateBody = z
  .object({
    value: z.record(z.string(), z.any()),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const adminEmailTemplatesUpdateBody = z
  .object({
    value: z.record(z.string(), z.any()),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const adminWebhookCreateBody = z
  .object({
    name: z.string().min(1).max(200),
    url: z.string().url(),
    eventTypes: z.array(z.string().min(1)).min(1),
    secret: z.string().min(8).max(200),
    active: z.boolean().optional(),
  })
  .strict();

export const adminWebhookUpdateBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    url: z.string().url().optional(),
    eventTypes: z.array(z.string().min(1)).min(1).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const adminWebhookIdParam = z.object({ id: z.string().min(1) });
export const adminWebhookDeliveryIdParam = z.object({
  id: z.string().min(1),
  deliveryId: z.string().min(1),
});
