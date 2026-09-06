import { z } from 'zod';

export const onboardingSupplierSchema = z
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
    categories: z.array(z.string().min(1)).min(1).default(['wholesale']),
  })
  .strict();

export const updateSupplierSchema = onboardingSupplierSchema.partial();

export type OnboardingSupplierInput = z.infer<typeof onboardingSupplierSchema>;
