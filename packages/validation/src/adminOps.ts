import { z } from 'zod';

export const adminReasonBody = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

export const adminOrderOverrideBody = z.object({
  status: z.enum([
    'pending',
    'accepted',
    'rejected',
    'preparing',
    'ready_for_pickup',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled',
    'disputed',
  ]),
  reason: z.string().trim().min(5).max(500),
  expectedUpdatedAt: z.number().int().optional(),
}).strict();

export const adminListQuery = z.object({
  status: z.string().max(50).optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
}).strict();
