// Gateway adapter interface. Payments.lk + Mock implement this. 'payhere' is a
// historical provider value retained for old DB rows only.

export type GatewayProvider = 'payments_lk' | 'payhere' | 'mock';

export interface StartCheckoutInput {
  paymentId: string;
  purchaseOrderId: string;
  amountCents: number;
  currency: string;
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  supplierName: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  /** Ask the gateway to offer card saving (payments.lk saveCard). */
  saveCard?: boolean;
}

export interface StartCheckoutResult {
  redirectUrl: string;
  gatewayRef: string;
  expiresAt: number;
}

export type WebhookEventType =
  | 'payment.success'
  | 'payment.pending'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.cancelled'
  | 'payment.chargeback'
  | 'refund.completed'
  | 'refund.failed'
  | 'card.saved'
  | 'unknown';

export interface SavedCardRef {
  id: string;
  brand?: string | undefined;
  last4?: string | undefined;
  expMonth?: number | undefined;
  expYear?: number | undefined;
}

export interface WebhookEvent {
  type: WebhookEventType;
  /** Our reference (payment id) or the gateway checkout id — whatever binds the event. */
  gatewayRef: string;
  paymentId?: string | undefined; // provider payment id
  amountCents?: number | undefined;
  currency?: string | undefined;
  /** Internal dedupe code (see the payments.lk plan's Global Constraints), not a vendor code. */
  statusCode?: number | undefined;
  refundId?: string | undefined; // provider refund id
  card?: SavedCardRef | undefined;
  raw: Record<string, unknown>;
}

export interface RefundInput {
  paymentGatewayRef: string;
  refundId: string;
  amountCents: number;
  reason?: string | undefined;
  /** Provider payment id (from a prior success webhook) when known. */
  providerTransactionId?: string | undefined;
}

export interface RefundResult {
  gatewayRefundId: string;
  status: 'completed' | 'pending' | 'failed';
  raw?: Record<string, unknown> | undefined;
}

export interface ChargeSavedCardInput {
  cardId: string; // provider card id
  amountCents: number;
  description: string;
  /** Our payment id, used as the provider reference. */
  reference: string;
  idempotencyKey: string;
}

export interface ChargeSavedCardResult {
  status: 'succeeded' | 'failed';
  paymentId?: string | undefined; // provider payment id
  error?: string | undefined;
}

export interface CheckoutStatusResult {
  status: 'pending' | 'succeeded' | 'failed' | 'expired';
  paymentId?: string | undefined;
}

export interface GatewayAdapter {
  readonly provider: GatewayProvider;
  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult>;
  parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifySignature(rawBody: string, signature: string | null): boolean;
  /** Off-session charge on a saved card. Optional: not all providers support it. */
  chargeSavedCard?(input: ChargeSavedCardInput): Promise<ChargeSavedCardResult>;
  /** Late-webhook fallback: read checkout state from the provider. */
  getCheckoutStatus?(gatewayRef: string): Promise<CheckoutStatusResult>;
}
