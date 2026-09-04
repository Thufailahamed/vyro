import { z } from 'zod';

export const DELIVERY_STATUSES = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const deliveryTransitionSchema = z
  .object({
    status: z.enum(DELIVERY_STATUSES),
    driverName: z.string().max(120).optional(),
    driverPhone: z.string().max(40).optional(),
    estimatedAt: z.number().int().nullable().optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();
