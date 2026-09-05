import { z } from 'zod';

export const adminAbuseReportsListQuery = z
  .object({
    status: z.enum(['open', 'investigating', 'resolved', 'dismissed']).optional(),
    assignedTo: z.enum(['me', 'unassigned']).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const adminAbuseReportIdParam = z.object({ id: z.string().min(1) });

export const adminAbuseReportNoteBody = z
  .object({
    note: z.string().min(1).max(2000),
  })
  .strict();

export const adminAbuseReportResolveBody = z
  .object({
    resolution: z.enum(['resolved', 'dismissed']),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const adminKycListQuery = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected', 'needs_more_info']).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const adminKycIdParam = z.object({ id: z.string().min(1) });

export const adminKycDecisionBody = z
  .object({
    decision: z.enum(['approved', 'rejected', 'needs_more_info']),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const adminKycCreateBody = z
  .object({
    userId: z.string().min(1),
    documentsJson: z.string().max(8000).optional(),
  })
  .strict();

export const adminUserIdParamSuspend = z.object({ id: z.string().min(1) });
