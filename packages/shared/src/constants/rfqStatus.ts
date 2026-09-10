export const RfqStatus = {
  DRAFT: 'draft',
  OPEN: 'open',
  QUOTING: 'quoting',
  QUOTES_RECEIVED: 'quotes_received',
  UNDER_REVIEW: 'under_review',
  AWARDED: 'awarded',
  CONVERTED_TO_ORDER: 'converted_to_order',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  CLOSED: 'closed',
} as const;
export type RfqStatus = (typeof RfqStatus)[keyof typeof RfqStatus];

export const RFQ_TRANSITIONS: Record<RfqStatus, readonly RfqStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['quoting', 'cancelled', 'expired', 'closed'],
  quoting: ['quotes_received', 'under_review', 'cancelled', 'expired', 'closed'],
  quotes_received: ['under_review', 'quoting', 'cancelled', 'expired', 'closed'],
  under_review: ['awarded', 'quoting', 'cancelled', 'expired', 'closed'],
  awarded: ['converted_to_order', 'closed'],
  converted_to_order: ['closed'],
  cancelled: [],
  expired: ['open', 'closed', 'cancelled'],
  closed: [],
};

export type RfqActor = 'business' | 'supplier' | 'admin' | 'system';

const RFQ_RULES: Array<{ from: RfqStatus; to: RfqStatus; actors: readonly RfqActor[] }> = [
  { from: 'draft', to: 'open', actors: ['business'] },
  { from: 'draft', to: 'cancelled', actors: ['business'] },
  { from: 'open', to: 'quoting', actors: ['supplier', 'system'] },
  { from: 'open', to: 'cancelled', actors: ['business'] },
  { from: 'open', to: 'expired', actors: ['system'] },
  { from: 'open', to: 'closed', actors: ['business'] },
  { from: 'quoting', to: 'quotes_received', actors: ['system', 'supplier'] },
  { from: 'quoting', to: 'under_review', actors: ['business'] },
  { from: 'quoting', to: 'cancelled', actors: ['business'] },
  { from: 'quoting', to: 'expired', actors: ['system'] },
  { from: 'quoting', to: 'closed', actors: ['business'] },
  { from: 'quotes_received', to: 'under_review', actors: ['business', 'system'] },
  { from: 'quotes_received', to: 'quoting', actors: ['business'] },
  { from: 'quotes_received', to: 'cancelled', actors: ['business'] },
  { from: 'quotes_received', to: 'expired', actors: ['system'] },
  { from: 'quotes_received', to: 'closed', actors: ['business'] },
  { from: 'under_review', to: 'awarded', actors: ['business'] },
  { from: 'under_review', to: 'quoting', actors: ['business'] },
  { from: 'under_review', to: 'cancelled', actors: ['business'] },
  { from: 'under_review', to: 'expired', actors: ['system'] },
  { from: 'under_review', to: 'closed', actors: ['business'] },
  { from: 'awarded', to: 'converted_to_order', actors: ['business', 'system'] },
  { from: 'awarded', to: 'closed', actors: ['business'] },
  { from: 'converted_to_order', to: 'closed', actors: ['business', 'system'] },
  { from: 'expired', to: 'open', actors: ['business'] },
  { from: 'expired', to: 'closed', actors: ['business'] },
  { from: 'expired', to: 'cancelled', actors: ['business'] },
];

export function canTransitionRfq(from: RfqStatus, to: RfqStatus, actor: RfqActor): boolean {
  const rule = RFQ_RULES.find((r) => r.from === from && r.to === to);
  if (!rule) return false;
  if (actor === 'admin') return true;
  return rule.actors.includes(actor);
}

export const QuoteStatus = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  NEGOTIATING: 'negotiating',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  WITHDRAWN: 'withdrawn',
  SUPERSEDED: 'superseded',
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'negotiating', 'accepted', 'rejected', 'expired', 'withdrawn'],
  under_review: ['negotiating', 'accepted', 'rejected', 'expired'],
  negotiating: ['submitted', 'accepted', 'rejected', 'expired', 'withdrawn'],
  accepted: [],
  rejected: [],
  expired: ['submitted'],
  withdrawn: ['submitted'],
  superseded: [],
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return (QUOTE_TRANSITIONS[from] ?? []).includes(to);
}

export const RFQ_AUDIT_ACTIONS = [
  'RFQ_CREATED',
  'RFQ_OPENED',
  'SUPPLIER_INVITED',
  'RFQ_VIEWED',
  'QUOTE_CREATED',
  'QUOTE_SUBMITTED',
  'QUOTE_UPDATED',
  'COUNTER_OFFER_CREATED',
  'COUNTER_OFFER_ACCEPTED',
  'QUOTE_ACCEPTED',
  'QUOTE_REJECTED',
  'RFQ_CANCELLED',
  'RFQ_EXPIRED',
  'RFQ_AWARDED',
  'ORDER_CREATED_FROM_QUOTE',
] as const;
export type RfqAuditAction = (typeof RFQ_AUDIT_ACTIONS)[number];
