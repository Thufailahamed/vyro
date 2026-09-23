export const ReturnStatus = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RECEIVED: 'received',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
  CLOSED: 'closed',
} as const;
export type ReturnStatus = (typeof ReturnStatus)[keyof typeof ReturnStatus];

export type ReturnActor = 'business' | 'supplier' | 'admin' | 'system';

const RETURN_RULES: ReadonlyArray<{ from: ReturnStatus; to: ReturnStatus; actors: readonly ReturnActor[] }> = [
  { from: 'requested', to: 'approved', actors: ['supplier', 'admin'] },
  { from: 'requested', to: 'rejected', actors: ['supplier', 'admin'] },
  { from: 'requested', to: 'cancelled', actors: ['business', 'admin'] },
  { from: 'approved', to: 'cancelled', actors: ['business', 'admin'] },
  { from: 'approved', to: 'received', actors: ['supplier', 'admin'] },
  { from: 'received', to: 'refunded', actors: ['system', 'admin'] },
  { from: 'refunded', to: 'closed', actors: ['system', 'admin'] },
];

export function canTransitionReturn(from: ReturnStatus, to: ReturnStatus, actor: ReturnActor): boolean {
  const rule = RETURN_RULES.find((r) => r.from === from && r.to === to);
  return !!rule && rule.actors.includes(actor);
}

/** Returns in these states hold the supplier's settlement and pause auto-complete. */
export const OPEN_RETURN_STATUSES: readonly ReturnStatus[] = ['requested', 'approved', 'received'];

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
