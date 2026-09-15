import { z } from 'zod';

export const trustSealCheckoutQuerySchema = z.object({
  supplierId: z.string().min(1, 'supplierId required'),
});

export const trustSealStatusSchema = z.object({
  active: z.boolean(),
  status: z.enum(['pending', 'active', 'expired', 'cancelled', 'none']),
  expiresAt: z.number().nullable(),
  memberSinceYear: z.number().nullable(),
});

export type TrustSealStatus = z.infer<typeof trustSealStatusSchema>;
