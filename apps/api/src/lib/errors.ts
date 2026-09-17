import { logger } from './logger';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'CONFIRM_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'FEATURE_DISABLED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_REFERENCE'
  | 'INTERNAL'
  | 'AI_DISABLED'
  | 'PROMPT_TOO_LONG'
  | 'INVALID_PROMPT'
  | 'AI_UNAVAILABLE'
  | 'HANDLER_FAILED'
  | 'PROMOTION_FAILED'
  | 'INVITE_EXPIRED'
  | 'INVITE_REVOKED'
  | 'INVITE_ACCEPTED'
  | 'ROLE_CONFLICT'
  | 'USER_SUSPENDED'
  | 'LAST_SUPER_ADMIN'
  | 'CANNOT_DEMOTE_SELF'
  | 'ROLE_CHANGED'
  | 'ROLE_NOT_GRANTABLE'
  | 'EMAIL_SEND_FAILED'
  | 'CATEGORY_HAS_CHILDREN'
  | 'CATEGORY_CYCLE'
  | 'TYPE_IN_USE'
  | 'PRODUCT_LOCKED'
  | 'OUT_OF_STOCK'
  | 'BELOW_MOQ'
  | 'INSUFFICIENT_STOCK'
  | 'STALE_WRITE'
  | 'REFUND_NOT_PENDING'
  | 'PAYOUT_NOT_PENDING'
  | 'PAYMENT_ALREADY_COMPLETED'
  | 'PAYMENT_NOT_FOUND'
  | 'INVALID_PAYMENT_AMOUNT'
  | 'PAYMENT_NOT_REFUNDABLE'
  | 'REFUND_EXCEEDS_REMAINING_AMOUNT'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'INVALID_PAYHERE_CALLBACK'
  | 'BANK_TRANSFER_ALREADY_VERIFIED'
  | 'SETTLEMENT_NOT_ELIGIBLE'
  | 'PAYOUT_ALREADY_COMPLETED'
  | 'INSUFFICIENT_SETTLEMENT_BALANCE'
  | 'UNAUTHORIZED_FINANCIAL_OPERATION'
  | 'BATCH_ALREADY_APPROVED'
  | 'CHARGEBACK_RESOLVED'
  | 'ABUSE_REPORT_NOT_OPEN'
  | 'KYC_NOT_PENDING'
  | 'CROSS_BORDER_DISABLED'
  | 'COUNTRY_SANCTIONED'
  | 'PRODUCT_RESTRICTED'
  | 'FX_UNAVAILABLE'
  | 'INVALID_INCOTERMS'
  | 'KYC_REQUIRED'
  | 'MISSING_CUSTOMS_DOC'
  | 'WIRE_RECONCILIATION_MISMATCH'
  | 'HS_CODE_UNKNOWN'
  | 'credit_not_eligible'
  | 'credit_overdue_blocked'
  | 'credit_limit_exceeded'
  | 'credit_drawdown_exists'
  | 'credit_limit_below_used'
  | 'NOT_ELIGIBLE'
  | 'SLOT_UNAVAILABLE'
  | 'SLOT_DUPLICATE'
  | 'CAMPAIGN_NOT_EDITABLE'
  | 'CAMPAIGN_NOT_CANCELABLE'
  | 'INVOICE_ALREADY_PAID'
  | 'INVALID_DATE_RANGE'
  | 'PO_NOT_REORDERABLE';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function httpError(
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
): HttpError {
  return new HttpError(status, code, message, details);
}

export function errorEnvelope(err: unknown): {
  status: number;
  body: { error: { code: ErrorCode; message: string; details?: unknown } };
} {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }
  // TenantAccessError (from @vyro/auth scope helpers) and similar
  // status-carrying errors are not HttpErrors but must still surface their
  // intended status — a forbidden tenant access is a 403, never a 500.
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && [400, 401, 403, 404, 409, 429].includes(status)) {
    const codeByStatus: Record<number, ErrorCode> = {
      400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN',
      404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'RATE_LIMITED',
    };
    const rawCode = (err as { code?: unknown } | null)?.code;
    const code = (typeof rawCode === 'string' ? rawCode : codeByStatus[status]) as ErrorCode;
    return { status, body: { error: { code, message: err instanceof Error ? err.message : 'Request failed' } } };
  }
  logger.error('error.unhandled', {
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  });
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Internal server error' } } };
}
