import { ApiError, errorMessage } from './api';
import { formatLKR } from './format';

/*
 * Order lifecycle constants and API shapes shared by the buyer, supplier and
 * admin portals. Copied from packages/shared/src/constants/{orderStatus,
 * paymentState,returnStatus}.ts — mobile doesn't depend on @vyro/shared, so
 * keep these in sync by hand. Prefer the server's `lifecycle.allowedTransitions`
 * over these rules whenever a detail response is available.
 */

export type ActorRole = 'business' | 'supplier' | 'admin' | 'system';

export const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: ['completed', 'disputed'],
  completed: ['disputed'],
  rejected: [],
  cancelled: [],
  disputed: [],
};

export const TRANSITION_RULES: readonly { from: string; to: string; actors: readonly ActorRole[] }[] = [
  { from: 'pending', to: 'accepted', actors: ['supplier'] },
  { from: 'pending', to: 'rejected', actors: ['supplier'] },
  { from: 'pending', to: 'cancelled', actors: ['business', 'system'] },
  { from: 'accepted', to: 'preparing', actors: ['supplier'] },
  { from: 'accepted', to: 'cancelled', actors: ['business', 'supplier'] },
  { from: 'preparing', to: 'ready_for_pickup', actors: ['supplier'] },
  { from: 'preparing', to: 'cancelled', actors: ['business', 'supplier'] },
  { from: 'ready_for_pickup', to: 'out_for_delivery', actors: ['supplier'] },
  { from: 'ready_for_pickup', to: 'cancelled', actors: ['admin'] },
  { from: 'out_for_delivery', to: 'delivered', actors: ['supplier'] },
  { from: 'delivered', to: 'completed', actors: ['business', 'system'] },
  { from: 'delivered', to: 'disputed', actors: ['admin', 'business'] },
  { from: 'completed', to: 'disputed', actors: ['admin', 'business'] },
];

export function canTransition(from: string, to: string, actor: ActorRole): boolean {
  const rule = TRANSITION_RULES.find((r) => r.from === from && r.to === to);
  if (!rule) return false;
  // Admin is an ops override: any otherwise-legal edge.
  if (actor === 'admin') return true;
  return rule.actors.includes(actor);
}

/** Every status `actor` may move `from` into. Disputes never exit this way. */
export function allowedTransitions(from: string, actor: ActorRole): string[] {
  return (ORDER_TRANSITIONS[from] ?? []).filter((to) => canTransition(from, to, actor));
}

/** Moves into these states must carry a reason (API: 422 REASON_REQUIRED). */
export const REASON_REQUIRED_TO: readonly string[] = ['rejected', 'cancelled', 'disputed'];
export const REASON_MIN = 3;

export function isReasonRequired(to: string): boolean {
  return REASON_REQUIRED_TO.includes(to);
}

/* ------------------------------ Payment state ----------------------------- */

export type PaymentState = 'unpaid' | 'partially_paid' | 'paid' | 'partially_refunded' | 'refunded' | 'cod_pending' | 'credit';

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  cod_pending: 'Cash on delivery',
  credit: 'On credit',
};

/** States in which a supplier may dispatch while the payment gate is on. */
export const DISPATCHABLE_PAYMENT_STATES: readonly PaymentState[] = ['paid', 'partially_refunded', 'cod_pending', 'credit'];

export interface PaymentSummary {
  method: 'online' | 'bank_transfer' | 'cod' | 'credit' | 'none';
  state: PaymentState;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  pendingRefundCents: number;
  dueCents: number;
}

/* --------------------------------- Returns -------------------------------- */

export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'refunded' | 'cancelled' | 'closed';

export const RETURN_REASON_CODES = ['damaged', 'wrong_item', 'short_shipped', 'quality', 'expired', 'other'] as const;
export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number];

export const RETURN_REASON_LABEL: Record<ReturnReasonCode, string> = {
  damaged: 'Damaged in transit',
  wrong_item: 'Wrong item sent',
  short_shipped: 'Short shipped',
  quality: 'Quality issue',
  expired: 'Expired / near expiry',
  other: 'Other',
};

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: 'Requested',
  approved: 'Approved — send back',
  rejected: 'Rejected',
  received: 'Received by supplier',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

/** Returns in these states hold the supplier's settlement. */
export const OPEN_RETURN_STATUSES: readonly ReturnStatus[] = ['requested', 'approved', 'received'];

export interface ReturnItem {
  id: string;
  purchaseOrderItemId: string;
  productName: string | null;
  quantity: number;
  approvedQuantity: number | null;
  receivedQuantity: number | null;
  restock: boolean | null;
  unitRefundCents: number;
  conditionNote: string | null;
}

export interface OrderReturn {
  id: string;
  rmaNumber: string;
  purchaseOrderId: string;
  businessId: string;
  supplierId: string;
  status: ReturnStatus;
  reasonCode: ReturnReasonCode;
  reasonNote: string | null;
  supplierNote: string | null;
  rejectionReason: string | null;
  refundCents: number | null;
  creditNoteInvoiceId: string | null;
  requestedAt: number;
  decidedAt: number | null;
  receivedAt: number | null;
  refundedAt: number | null;
  createdAt: number;
  updatedAt: number;
  items: ReturnItem[];
  attachments: { id: string; contentType: string; createdAt: number }[];
  poNumber?: string;
}

/* ------------------------------ Detail shapes ----------------------------- */

export interface OrderLifecycle {
  viewerRole: 'business' | 'supplier' | 'admin';
  allowedTransitions: string[];
  disputeWindowEndsAt: number | null;
  returnWindowEndsAt: number | null;
  autoCompleteAt: number | null;
  autoCancelAt: number | null;
  paymentGateEnabled: boolean;
  returnsEnabled: boolean;
}

export interface LifecycleDelivery {
  status: string;
  driverName: string | null;
  driverPhone: string | null;
  estimatedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  recipientName: string | null;
  podNote: string | null;
  podCapturedAt: number | null;
  failedReason: string | null;
  hasPodPhoto: boolean;
}

/** Extra order columns added by the lifecycle backend. */
export interface LifecycleOrderFields {
  originalTotalCents?: number | null;
  partiallyFulfilledAt?: number | null;
  cancelledByRole?: string | null;
  autoAction?: string | null;
  disputeReason?: string | null;
  disputeOpenedBy?: string | null;
  disputeResolvedAt?: number | null;
  disputeOutcome?: string | null;
}

export type FulfilmentStatus = 'open' | 'accepted' | 'reduced' | 'unavailable';

/** Line-item fields added by partial acceptance. */
export interface LifecycleItemFields {
  requestedQuantity?: number | null;
  fulfilmentStatus?: FulfilmentStatus | null;
  unavailableReason?: string | null;
}

export interface LifecycleDetailFields {
  paymentSummary?: PaymentSummary | null;
  delivery?: LifecycleDelivery | null;
  returns?: OrderReturn[];
  lifecycle?: OrderLifecycle;
}

/** Ordered quantity for a line (older rows have no requestedQuantity). */
export function requestedQty(it: { quantity: number } & LifecycleItemFields): number {
  return it.requestedQuantity ?? it.quantity;
}

/** Whether the supplier may dispatch now (server enforces with 402). */
export function isDispatchable(summary: PaymentSummary | null | undefined, lifecycle: OrderLifecycle | undefined): boolean {
  if (!lifecycle?.paymentGateEnabled || !summary) return true;
  return DISPATCHABLE_PAYMENT_STATES.includes(summary.state);
}

/* --------------------------------- Errors --------------------------------- */

export const LIFECYCLE_ERROR_COPY: Record<string, string> = {
  REASON_REQUIRED: 'Please give a reason for this change.',
  DISPUTE_WINDOW_CLOSED: 'The window for opening a dispute on this order has closed.',
  PAYMENT_REQUIRED: 'This order must be paid before it can be dispatched.',
  RETURN_WINDOW_CLOSED: 'The return window for this order has closed.',
  MISSING_CUSTOMS_DOC: 'Required customs documents have not been uploaded.',
  POD_REQUIRED: 'Record the recipient name and a photo or note before marking delivered.',
  STALE_STATE: 'This order changed while you were working on it. Refresh and try again.',
  NOTHING_TO_ACCEPT: 'Every line is marked unavailable — reject the order instead.',
};

/** Human copy for lifecycle guard failures; falls back to the server message. */
export function lifecycleErrorMessage(e: unknown, fallback?: string): string {
  if (e instanceof ApiError && LIFECYCLE_ERROR_COPY[e.code]) {
    const base = LIFECYCLE_ERROR_COPY[e.code];
    if (e.code === 'PAYMENT_REQUIRED') {
      const due = (e.details as { dueCents?: number } | undefined)?.dueCents;
      return due ? `${base} ${formatLKR(due)} is still due.` : base;
    }
    return base;
  }
  return errorMessage(e, fallback);
}

export function isLifecycleError(e: unknown, code: string): boolean {
  return e instanceof ApiError && e.code === code;
}

/**
 * Order events with `metadata.kind === 'delivery'` record delivery progress,
 * not a status move. Returns the delivery status they moved to, else null.
 */
export function deliveryEventStatus(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata) as { kind?: string; to?: string };
    return m.kind === 'delivery' ? (m.to ?? 'updated') : null;
  } catch {
    return null;
  }
}
