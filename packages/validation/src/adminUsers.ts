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
      ])
      .optional(),
  })
  .strict();

export const adminUserIdParam = z.object({ id: z.string().uuid() }).strict();
