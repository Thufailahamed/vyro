import type { TimelineStep } from '@/ui';
import { allowedTransitions } from '@/lib/orderLifecycle';

/**
 * Transitions the buyer (business actor) may perform from `status`.
 * Fallback only — the detail response's `lifecycle.allowedTransitions` is authoritative.
 * The rule table is copied into lib/orderLifecycle.ts from packages/shared.
 */
export function buyerTransitions(status: string): string[] {
  return allowedTransitions(status, 'business');
}

export const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready_for_pickup', label: 'Ready' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'disputed', label: 'Disputed' },
] as const;

export const IN_FLIGHT = ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'];
export const TERMINAL = ['rejected', 'cancelled', 'disputed', 'failed'];
/** Direct re-issue from the orders list (web OrdersPage). */
export const REORDERABLE = new Set(['delivered', 'completed']);
/** Reorder into cart (web ReorderButton). */
export const REORDER_TO_CART = new Set(['completed', 'delivered', 'ready_for_pickup']);

const JOURNEY_INDEX: Record<string, number> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready_for_pickup: 3,
  out_for_delivery: 3,
  delivered: 4,
  completed: 4,
};

const JOURNEY_NODES = [
  { label: 'Order placed', hint: 'Purchase order issued' },
  { label: 'Supplier acknowledged', hint: 'Accepted by the facility' },
  { label: 'Preparation', hint: 'Picking & packing' },
  { label: 'Delivery', hint: 'En route / ready for pickup' },
  { label: 'Received & settled', hint: 'Goods receipt, funds released' },
];

/** 0..1 progress along the five-node journey. */
export function journeyProgress(status: string): number {
  if (TERMINAL.includes(status)) return 0;
  if (status === 'completed') return 1;
  const i = JOURNEY_INDEX[status] ?? 0;
  return (i + (status === 'delivered' ? 0.75 : 0.5)) / JOURNEY_NODES.length;
}

export function journeyIndex(status: string): number {
  return JOURNEY_INDEX[status] ?? 0;
}

/** Timeline steps; hints are enriched with actual timestamps when present. */
export function journeySteps(status: string, stamps: (string | null | undefined)[] = []): TimelineStep[] {
  if (TERMINAL.includes(status)) {
    return JOURNEY_NODES.map((n, i) => ({ label: n.label, hint: stamps[i] ?? n.hint, state: i === 0 ? 'active' : 'idle' }));
  }
  const active = JOURNEY_INDEX[status] ?? 0;
  const done = status === 'completed';
  return JOURNEY_NODES.map((n, i) => ({
    label: n.label,
    hint: stamps[i] ?? n.hint,
    state: done || i < active ? 'done' : i === active ? 'active' : 'idle',
  }));
}

export function statusHeadline(status: string): string {
  switch (status) {
    case 'pending':
      return 'Awaiting supplier';
    case 'accepted':
      return 'Confirmed by supplier';
    case 'preparing':
      return 'Being prepared';
    case 'ready_for_pickup':
      return 'Ready for pickup';
    case 'out_for_delivery':
      return 'On the way';
    case 'delivered':
      return 'Delivered — confirm receipt';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'rejected':
      return 'Rejected by supplier';
    case 'disputed':
      return 'Under dispute';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const INVOICE_TYPE_LABEL: Record<string, string> = { receipt: 'Receipt', tax_invoice: 'Tax invoice', credit_note: 'Credit note' };

export function invoiceTypeLabel(type: string): string {
  return INVOICE_TYPE_LABEL[type] ?? statusLabel(type);
}
