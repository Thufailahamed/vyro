import { paymentsLkEventToType, paymentsLkStatusCode, verifyPaymentsSignature } from './paymentslk';
import type {
  GatewayAdapter,
  StartCheckoutInput,
  StartCheckoutResult,
  WebhookEvent,
  WebhookEventType,
  RefundInput,
  RefundResult,
  ChargeSavedCardInput,
  ChargeSavedCardResult,
  CheckoutStatusResult,
} from './types';

const INTERNAL_EVENT_TYPES: readonly string[] = [
  'payment.success',
  'payment.pending',
  'payment.failed',
  'payment.expired',
  'payment.cancelled',
  'payment.chargeback',
  'refund.completed',
  'refund.failed',
  'card.saved',
];

/** Vendor event names map through payments.lk's vocabulary; internal names pass through. */
function mockEventType(raw: string): WebhookEventType {
  const mapped = paymentsLkEventToType(raw);
  if (mapped !== 'unknown') return mapped;
  return (INTERNAL_EVENT_TYPES as readonly string[]).includes(raw) ? (raw as WebhookEventType) : 'unknown';
}

export interface MockConfig {
  /** Webhook signing secret — same t.v1 HMAC contract as payments.lk. */
  secret?: string | undefined;
  /** Fail every success-shaped webhook and refund. */
  forceFailure?: boolean | undefined;
  /** Default 'completed'; 'pending' exercises webhook-driven refund finalization. */
  refundResult?: 'completed' | 'pending' | 'failed' | undefined;
}

export class MockGateway implements GatewayAdapter {
  readonly provider = 'mock' as const;
  constructor(private readonly cfg: MockConfig = {}) {}

  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
    const gatewayRef = `MOCK-${input.purchaseOrderId}-${Date.now()}`;
    return Promise.resolve({
      redirectUrl: `https://mock.vyro.local/checkout/${gatewayRef}`,
      gatewayRef,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
  }

  async parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent> {
    let parsed: Record<string, any>;
    try {
      parsed = rawBody.trimStart().startsWith('{')
        ? (JSON.parse(rawBody) as Record<string, any>)
        : Object.fromEntries(new URLSearchParams(rawBody));
    } catch {
      throw new Error('mock webhook: unparseable body');
    }
    const vendorType = typeof parsed.type === 'string' ? parsed.type : '';
    const type = mockEventType(vendorType);
    if (this.cfg.forceFailure && type === 'payment.success') {
      throw new Error('mock: forced failure');
    }
    if (signature && !verifyPaymentsSignature(this.cfg.secret ?? '', rawBody, signature)) {
      throw new Error('mock webhook signature mismatch');
    }
    const data = (parsed.data ?? {}) as Record<string, any>;
    const legacyAmountCents =
      typeof parsed.amount === 'string' ? Math.round(parseFloat(parsed.amount) * 100) : undefined;
    const payment = (data.payment ?? {}) as Record<string, any>;
    return {
      type,
      gatewayRef: String(data.reference ?? parsed.reference ?? parsed.order_id ?? ''),
      paymentId: data.id
        ? String(data.id)
        : data.paymentId
          ? String(data.paymentId)
          : payment.id
            ? String(payment.id)
            : parsed.payment_id
              ? String(parsed.payment_id)
              : undefined,
      amountCents:
        typeof data.amountCents === 'number'
          ? data.amountCents
          : typeof payment.amountCents === 'number'
            ? payment.amountCents
            : legacyAmountCents,
      currency: typeof data.currency === 'string' ? data.currency : 'LKR',
      statusCode: paymentsLkStatusCode(vendorType) ?? paymentsLkStatusCode(type),
      refundId: data.refundId ? String(data.refundId) : data.refund?.id ? String(data.refund.id) : undefined,
      raw: parsed,
    };
  }

  refund(input: RefundInput): Promise<RefundResult> {
    if (this.cfg.forceFailure || this.cfg.refundResult === 'failed') {
      return Promise.resolve({ gatewayRefundId: '', status: 'failed', raw: { reason: 'mock-forced-failure' } });
    }
    if (this.cfg.refundResult === 'pending') {
      return Promise.resolve({ gatewayRefundId: `MOCK-RFND-${input.refundId}`, status: 'pending', raw: { input } });
    }
    return Promise.resolve({ gatewayRefundId: `MOCK-RFND-${input.refundId}`, status: 'completed', raw: { input } });
  }

  async chargeSavedCard(input: ChargeSavedCardInput): Promise<ChargeSavedCardResult> {
    if (this.cfg.forceFailure) return { status: 'failed', error: 'mock-forced-failure' };
    return { status: 'succeeded', paymentId: `MOCK-PAY-${Date.now()}` };
  }

  async getCheckoutStatus(_gatewayRef: string): Promise<CheckoutStatusResult> {
    if (this.cfg.forceFailure) return { status: 'failed' };
    return { status: 'pending' };
  }

  verifySignature(rawBody: string, signature: string | null): boolean {
    if (!this.cfg.secret) return signature === null;
    try {
      return verifyPaymentsSignature(this.cfg.secret, rawBody, signature);
    } catch {
      return false;
    }
  }
}
