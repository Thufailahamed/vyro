/** Derived payment position of a purchase order (never stored; see API payments/summary). */
export const PaymentState = {
  UNPAID: 'unpaid',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  PARTIALLY_REFUNDED: 'partially_refunded',
  REFUNDED: 'refunded',
  COD_PENDING: 'cod_pending',
  CREDIT: 'credit',
} as const;
export type PaymentState = (typeof PaymentState)[keyof typeof PaymentState];

export type PaymentSummaryMethod = 'online' | 'bank_transfer' | 'cod' | 'credit' | 'none';

export interface PaymentSummary {
  method: PaymentSummaryMethod;
  state: PaymentState;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  pendingRefundCents: number;
  dueCents: number;
}

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
export const DISPATCHABLE_PAYMENT_STATES: readonly PaymentState[] = [
  'paid',
  'partially_refunded',
  'cod_pending',
  'credit',
];
