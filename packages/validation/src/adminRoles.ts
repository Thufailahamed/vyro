import { z } from 'zod';

export const adminRoleChange = z.object({
  role: z.enum(['super_admin', 'ops', 'finance', 'support']),
});

export const adminUserIdParam = z.object({ id: z.string().min(1) });
