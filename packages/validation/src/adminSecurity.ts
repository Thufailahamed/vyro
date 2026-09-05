import { z } from 'zod';

export const adminSessionIdParam = z.object({ id: z.string().min(1) });

export const adminImpersonateBody = z
  .object({
    targetUserId: z.string().min(1),
    reason: z.string().min(5).max(500),
  })
  .strict();

export const adminDataExportCreateBody = z
  .object({
    userId: z.string().min(1),
  })
  .strict();

export const adminDataExportIdParam = z.object({ id: z.string().min(1) });

export const adminUser2faBody = z
  .object({
    reason: z.string().min(5).max(500).optional(),
  })
  .strict()
  .default({});
