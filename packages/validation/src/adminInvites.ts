import { z } from 'zod';

export const adminInviteCreate = z.object({
  email: z.string().email(),
  role: z.enum(['ops', 'finance', 'support', 'super_admin']),
});

export const adminInviteAccept = z.object({
  token: z.string().min(32),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const adminInviteListQuery = z.object({
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
});

export const adminInviteIdParam = z.object({ id: z.string().uuid() });
