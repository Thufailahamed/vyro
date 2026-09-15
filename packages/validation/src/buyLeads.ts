import { z } from 'zod';

export const buyLeadsSubscriptionSchema = z.object({
  enabled: z.boolean(),
  categoryIds: z.array(z.string()).max(200),
});
export type BuyLeadsSubscription = z.infer<typeof buyLeadsSubscriptionSchema>;

export const buyLeadsDigestPayloadSchema = z.object({
  kind: z.literal('buyleads_digest'),
  recipientUserId: z.string(),
  recipientEmail: z.string(),
  subject: z.string(),
  body: z.string(),
  link: z.string(),
});
export type BuyLeadsDigestPayload = z.infer<typeof buyLeadsDigestPayloadSchema>;
