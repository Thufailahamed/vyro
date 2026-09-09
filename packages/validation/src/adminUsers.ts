import { z } from 'zod';

export const adminUsersListQuery = z
  .object({
    cursor: z.string().min(1).optional(),
    q: z.string().min(1).max(120).optional(),
    role: z
      .union([
        z.literal('admin'),
        z.literal('business'),
        z.literal('supplier'),
        z.literal('user'),
        z.literal('super_admin'),
        z.literal('ops'),
        z.literal('finance'),
        z.literal('support'),
      ])
      .optional(),
    isAdmin: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const adminUserIdParam = z.object({ id: z.string().min(1) }).strict();
