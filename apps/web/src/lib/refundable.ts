export interface RefundLike {
  amountCents: number;
  status: string;
}

/** Statuses the server counts against the refundable balance (refunds/executor.ts). */
const OCCUPYING_STATUSES = new Set(['requested', 'approved', 'processing', 'completed']);

export function remainingRefundableCents(paymentAmountCents: number, refunds: RefundLike[]): number {
  const used = refunds
    .filter((r) => OCCUPYING_STATUSES.has(r.status))
    .reduce((sum, r) => sum + r.amountCents, 0);
  return Math.max(0, paymentAmountCents - used);
}
