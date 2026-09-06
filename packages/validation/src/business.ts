import { z } from 'zod';

export const BUSINESS_MEMBER_ROLES = ['owner', 'manager', 'purchasing', 'accountant'] as const;
export type BusinessMemberRole = (typeof BUSINESS_MEMBER_ROLES)[number];

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

export const inviteBusinessMemberSchema = z
  .object({
    email: z.string().email(),
    role: z.enum(BUSINESS_MEMBER_ROLES).default('purchasing'),
  })
  .strict();

export const updateBusinessMemberRoleSchema = z
  .object({
    role: z.enum(BUSINESS_MEMBER_ROLES),
  })
  .strict();

export type OnboardingBusinessInput = z.infer<typeof onboardingBusinessSchema>;
export type InviteBusinessMemberInput = z.infer<typeof inviteBusinessMemberSchema>;
export type UpdateBusinessMemberRoleInput = z.infer<typeof updateBusinessMemberRoleSchema>;
