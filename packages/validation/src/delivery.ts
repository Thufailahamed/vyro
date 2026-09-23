import { z } from 'zod';

export const DELIVERY_STATUSES = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type DeliveryActor = 'supplier' | 'admin' | 'business';

export interface DeliveryTransitionRule {
  from: DeliveryStatus;
  to: DeliveryStatus;
  actors: readonly DeliveryActor[];
}

/**
 * State machine for delivery status.
 *
 * `delivered` is set by the supplier (driver arrived). Business confirmation
 * of receipt happens via the PO state machine (`delivered → completed`)
 * — deliveries are intentionally a separate state from PO completion so
 * that a single endpoint cannot mark both at once.
 */
export const DELIVERY_TRANSITIONS: readonly DeliveryTransitionRule[] = [
  { from: 'pending', to: 'assigned', actors: ['supplier', 'admin'] },
  { from: 'pending', to: 'failed', actors: ['supplier', 'admin'] },
  { from: 'assigned', to: 'picked_up', actors: ['supplier', 'admin'] },
  { from: 'assigned', to: 'failed', actors: ['supplier', 'admin'] },
  { from: 'picked_up', to: 'in_transit', actors: ['supplier', 'admin'] },
  { from: 'picked_up', to: 'failed', actors: ['supplier', 'admin'] },
  { from: 'in_transit', to: 'delivered', actors: ['supplier', 'admin'] },
  { from: 'in_transit', to: 'failed', actors: ['supplier', 'admin'] },
  { from: 'delivered', to: 'in_transit', actors: ['admin'] }, // reversal — admin only
  { from: 'failed', to: 'pending', actors: ['admin'] }, // retry — admin only
];

export function canTransitionDelivery(
  from: DeliveryStatus,
  to: DeliveryStatus,
  actor: DeliveryActor,
): boolean {
  return DELIVERY_TRANSITIONS.some(
    (r) => r.from === from && r.to === to && r.actors.includes(actor),
  );
}

export const deliveryTransitionSchema = z
  .object({
    status: z.enum(DELIVERY_STATUSES),
    driverName: z.string().max(120).optional(),
    driverPhone: z.string().max(40).optional(),
    estimatedAt: z.number().int().nullable().optional(),
    reason: z.string().max(500).optional(),
    // Tracking + proof of delivery (required for `delivered`, enforced server-side
    // against what is already stored on the delivery row).
    carrier: z.string().trim().max(80).optional(),
    trackingNumber: z.string().trim().max(120).optional(),
    trackingUrl: z.string().trim().url().max(500).optional(),
    recipientName: z.string().trim().max(120).optional(),
    podNote: z.string().trim().max(500).optional(),
  })
  .strict();

/** A delivery may only be marked delivered with a recipient plus a photo or note. */
export function hasProofOfDelivery(d: {
  recipientName?: string | null;
  podNote?: string | null;
  podPhotoKey?: string | null;
}): boolean {
  return !!d.recipientName?.trim() && (!!d.podPhotoKey || !!d.podNote?.trim());
}
