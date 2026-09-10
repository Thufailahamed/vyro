export const PaymentStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  CHARGEBACK: 'chargeback',
  REFUNDED: 'refunded',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  ONLINE: 'online',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * Canonical financial model (spec §4-5). Legacy DB values are kept for
 * backwards compatibility; canonical values are the public API contract.
 *
 * Method mapping:   PAYHERE <-> online,  COD <-> cash,  BANK_TRANSFER <-> bank_transfer
 * Status mapping:   PAID <-> confirmed,  PARTIALLY_REFUNDED/REFUNDED <-> refunded, etc.
 */
export const CanonicalPaymentMethod = {
  PAYHERE: 'PAYHERE',
  COD: 'COD',
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;
export type CanonicalPaymentMethod =
  (typeof CanonicalPaymentMethod)[keyof typeof CanonicalPaymentMethod];

export const CanonicalPaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const;
export type CanonicalPaymentStatus =
  (typeof CanonicalPaymentStatus)[keyof typeof CanonicalPaymentStatus];

const LEGACY_METHOD_TO_CANONICAL: Record<string, CanonicalPaymentMethod> = {
  online: 'PAYHERE',
  cash: 'COD',
  bank_transfer: 'BANK_TRANSFER',
};

const CANONICAL_METHOD_TO_LEGACY: Record<CanonicalPaymentMethod, PaymentMethod> = {
  PAYHERE: 'online',
  COD: 'cash',
  BANK_TRANSFER: 'bank_transfer',
};

export function toCanonicalMethod(method: string): CanonicalPaymentMethod {
  const c = LEGACY_METHOD_TO_CANONICAL[method] ?? (method as CanonicalPaymentMethod);
  if (c !== 'PAYHERE' && c !== 'COD' && c !== 'BANK_TRANSFER') {
    throw new Error(`Unknown payment method: ${method}`);
  }
  return c;
}

export function toLegacyMethod(method: string): PaymentMethod {
  if (method === 'PAYHERE' || method === 'COD' || method === 'BANK_TRANSFER') {
    return CANONICAL_METHOD_TO_LEGACY[method as CanonicalPaymentMethod];
  }
  if (method === 'online' || method === 'cash' || method === 'bank_transfer') {
    return method;
  }
  throw new Error(`Unknown payment method: ${method}`);
}

const LEGACY_STATUS_TO_CANONICAL: Record<string, CanonicalPaymentStatus> = {
  pending: 'PENDING',
  confirmed: 'PAID',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
  chargeback: 'FAILED',
  refunded: 'REFUNDED',
};

export function toCanonicalStatus(status: string): CanonicalPaymentStatus {
  const direct = (Object.values(CanonicalPaymentStatus) as string[]).includes(status);
  if (direct) return status as CanonicalPaymentStatus;
  const mapped = LEGACY_STATUS_TO_CANONICAL[status];
  if (!mapped) throw new Error(`Unknown payment status: ${status}`);
  return mapped;
}

/** Backend-controlled payment state machine. Only listed transitions allowed. */
const PAYMENT_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ['PROCESSING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'PENDING_VERIFICATION'],
  PENDING_VERIFICATION: ['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PROCESSING: ['AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'],
  AUTHORIZED: ['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PAID: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
  // Legacy aliases resolve through toCanonicalStatus first.
  pending: ['PROCESSING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'PENDING_VERIFICATION'],
  confirmed: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  failed: [],
  cancelled: [],
  chargeback: [],
  refunded: [],
};

export function canTransitionPayment(from: string, to: string): boolean {
  const allowed = PAYMENT_TRANSITIONS[from];
  if (!allowed) return false;
  if (allowed.includes(to)) return true;
  // Allow legacy/canonical cross-spellings that mean the same state.
  try {
    const cf = toCanonicalStatus(from);
    const ct = toCanonicalStatus(to);
    if (cf === ct) return true;
    return (PAYMENT_TRANSITIONS[cf] ?? []).includes(ct);
  } catch {
    return false;
  }
}

/** Terminal payment states — no further transitions permitted. */
export function isTerminalPaymentStatus(status: string): boolean {
  try {
    const c = toCanonicalStatus(status);
    return c === 'FAILED' || c === 'CANCELLED' || c === 'EXPIRED' || c === 'REFUNDED';
  } catch {
    return false;
  }
}

/** Refund lifecycle: REQUESTED → APPROVED → PROCESSING → COMPLETED (+reject/fail/cancel legs). */
export const RefundStatus = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

const REFUND_TRANSITIONS: Record<string, readonly string[]> = {
  requested: ['approved', 'rejected', 'cancelled', 'processing'],
  approved: ['processing', 'cancelled'],
  pending: ['processing', 'failed', 'cancelled'],
  processing: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['processing'],
  rejected: [],
  cancelled: [],
};

export function canTransitionRefund(from: string, to: string): boolean {
  return (REFUND_TRANSITIONS[from] ?? []).includes(to);
}

/** Settlement lifecycle. */
export const SettlementStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

const SETTLEMENT_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['approved', 'cancelled'],
  approved: ['processing', 'cancelled'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: ['processing'],
  cancelled: [],
};

export function canTransitionSettlement(from: string, to: string): boolean {
  return (SETTLEMENT_TRANSITIONS[from] ?? []).includes(to);
}

/** Payout lifecycle. */
export const PayoutStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

const PAYOUT_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['approved', 'processing', 'cancelled'],
  approved: ['processing', 'cancelled'],
  processing: ['completed', 'paid', 'failed'],
  completed: [],
  paid: [],
  failed: ['processing'],
  cancelled: [],
};

export function canTransitionPayout(from: string, to: string): boolean {
  return (PAYOUT_TRANSITIONS[from] ?? []).includes(to);
}

/** Standardized financial error codes (spec §52). */
export const FinancialErrorCode = {
  PAYMENT_ALREADY_COMPLETED: 'PAYMENT_ALREADY_COMPLETED',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  INVALID_PAYMENT_AMOUNT: 'INVALID_PAYMENT_AMOUNT',
  PAYMENT_NOT_REFUNDABLE: 'PAYMENT_NOT_REFUNDABLE',
  REFUND_EXCEEDS_REMAINING_AMOUNT: 'REFUND_EXCEEDS_REMAINING_AMOUNT',
  PAYMENT_PROVIDER_ERROR: 'PAYMENT_PROVIDER_ERROR',
  INVALID_PAYHERE_CALLBACK: 'INVALID_PAYHERE_CALLBACK',
  BANK_TRANSFER_ALREADY_VERIFIED: 'BANK_TRANSFER_ALREADY_VERIFIED',
  SETTLEMENT_NOT_ELIGIBLE: 'SETTLEMENT_NOT_ELIGIBLE',
  PAYOUT_ALREADY_COMPLETED: 'PAYOUT_ALREADY_COMPLETED',
  INSUFFICIENT_SETTLEMENT_BALANCE: 'INSUFFICIENT_SETTLEMENT_BALANCE',
  UNAUTHORIZED_FINANCIAL_OPERATION: 'UNAUTHORIZED_FINANCIAL_OPERATION',
} as const;
