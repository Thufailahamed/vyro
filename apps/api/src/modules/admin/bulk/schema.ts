import { z } from 'zod';

export const bulkIdsBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export const bulkUsersRoleBody = bulkIdsBody.extend({
  role: z.enum(['super_admin', 'ops', 'finance', 'support']),
});

export type BulkResult = {
  batchId: string;
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; code: string; message: string }>;
};
