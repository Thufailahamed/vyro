import { z } from 'zod';

export const adminRoleChange = z.object({
  role: z.enum(['super_admin', 'ops', 'finance', 'support']),
});

export { adminUserIdParam } from './adminUsers';
