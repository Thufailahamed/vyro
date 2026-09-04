import { z } from 'zod';

export const onboardingBusinessSchema = z
  .object({
    name: z.string().min(2).max(120),
    businessTypeSlug: z.string().min(1),
    contactPerson: z.string().min(1).max(120),
    phone: z.string().min(7).max(20),
    email: z.string().email(),
    address: z.string().min(1).max(255),
    city: z.string().min(1).max(80),
    district: z.string().min(1).max(80),
    description: z.string().max(1000).optional(),
  })
  .strict();

export const updateBusinessSchema = onboardingBusinessSchema.partial();

export type OnboardingBusinessInput = z.infer<typeof onboardingBusinessSchema>;
