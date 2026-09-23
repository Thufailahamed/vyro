export const OrderStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
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

export type ActorRole = 'business' | 'supplier' | 'admin' | 'system';

export interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly ActorRole[];
}

export const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: 'pending', to: 'accepted', actors: ['supplier'] },
  { from: 'pending', to: 'rejected', actors: ['supplier'] },
  // `system` = lifecycle cron (supplier never responded).
  { from: 'pending', to: 'cancelled', actors: ['business', 'system'] },
  { from: 'accepted', to: 'preparing', actors: ['supplier'] },
  // Suppliers may back out after accepting (stock-out, can't fulfil) — reason required.
  { from: 'accepted', to: 'cancelled', actors: ['business', 'supplier'] },
  { from: 'preparing', to: 'ready_for_pickup', actors: ['supplier'] },
  { from: 'preparing', to: 'cancelled', actors: ['business', 'supplier'] },
  { from: 'ready_for_pickup', to: 'out_for_delivery', actors: ['supplier'] },
  // Goods are packed; only ops can unwind from here.
  { from: 'ready_for_pickup', to: 'cancelled', actors: ['admin'] },
  { from: 'out_for_delivery', to: 'delivered', actors: ['supplier'] },
  // `system` = auto-complete after the confirmation window.
  { from: 'delivered', to: 'completed', actors: ['business', 'system'] },
  { from: 'delivered', to: 'disputed', actors: ['admin', 'business'] },
  { from: 'completed', to: 'disputed', actors: ['admin', 'business'] },
];

export function canTransition(from: OrderStatus, to: OrderStatus, actor: ActorRole): boolean {
  const rule = TRANSITION_RULES.find((r) => r.from === from && r.to === to);
  if (!rule) return false;
  // Admin is an ops override: may perform any otherwise-legal state edge,
  // so stuck orders (e.g. supplier unresponsive) can be recovered with audit.
  if (actor === 'admin') return true;
  return rule.actors.includes(actor);
}

/** Moves into these states must carry a human-readable reason. */
export const REASON_REQUIRED_TO: readonly OrderStatus[] = ['rejected', 'cancelled', 'disputed'];

export function isReasonRequired(to: OrderStatus): boolean {
  return REASON_REQUIRED_TO.includes(to);
}

/**
 * Exits from `disputed`. Deliberately NOT part of ORDER_TRANSITIONS: the only
 * way out of a dispute is the admin resolution flow (which settles money
 * first), never a generic override or status edit.
 */
export const DISPUTE_RESOLUTION_EDGES: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  disputed: ['completed', 'cancelled'],
};

export function canResolveDispute(from: OrderStatus, to: OrderStatus): boolean {
  return (DISPUTE_RESOLUTION_EDGES[from] ?? []).includes(to);
}

/** Every status the given actor may move `from` into (used by UIs). */
export function allowedTransitions(from: OrderStatus, actor: ActorRole): OrderStatus[] {
  return (ORDER_TRANSITIONS[from] ?? []).filter((to) => canTransition(from, to, actor));
}

/** Tunable lifecycle windows. The API reads overrides from config; these are defaults. */
export const ORDER_LIFECYCLE_DEFAULTS = {
  pendingAutoCancelHours: 48,
  autoCompleteDays: 3,
  disputeWindowDays: 7,
  returnWindowDays: 7,
  returnEscalationDays: 3,
  paymentGateEnabled: true,
  returnsEnabled: true,
  automationEnabled: true,
};

export type OrderLifecycleConfig = typeof ORDER_LIFECYCLE_DEFAULTS & {
  /** Auto-cancel only touches orders created after automation was first switched on. */
  automationSince?: number;
};

/** Stable machine codes the API returns for lifecycle guard failures. */
export const LIFECYCLE_ERROR_COPY: Record<string, string> = {
  REASON_REQUIRED: 'Please give a reason for this change.',
  DISPUTE_WINDOW_CLOSED: 'The window for opening a dispute on this order has closed.',
  PAYMENT_REQUIRED: 'This order must be paid before it can be dispatched.',
  RETURN_WINDOW_CLOSED: 'The return window for this order has closed.',
  MISSING_CUSTOMS_DOC: 'Required customs documents have not been uploaded.',
  POD_REQUIRED: 'Record the recipient name and a photo or note before marking delivered.',
  STALE_STATE: 'This order changed while you were working on it. Refresh and try again.',
};
