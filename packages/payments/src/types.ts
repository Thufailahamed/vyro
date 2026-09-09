// Gateway adapter interface. PayHere + Mock implement this.

export type GatewayProvider = 'payhere' | 'mock';

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
  | 'payment.cancelled'
  | 'payment.chargeback'
  | 'refund.completed';

export interface WebhookEvent {
  type: WebhookEventType;
  gatewayRef: string;
  paymentId?: string | undefined;
  amountCents?: number | undefined;
  currency?: string | undefined;
  statusCode?: number | undefined; // 2 success, 0 pending, -1 cancelled, -2 failed, -3 chargeback
  raw: Record<string, string>;
}

export interface RefundInput {
  paymentGatewayRef: string;
  refundId: string;
  amountCents: number;
  reason?: string | undefined;
}

export interface RefundResult {
  gatewayRefundId: string;
  status: 'completed' | 'pending' | 'failed';
  raw?: Record<string, unknown> | undefined;
}

export interface GatewayAdapter {
  readonly provider: GatewayProvider;
  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult>;
  parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifySignature(rawBody: string, signature: string | null): boolean;
}
