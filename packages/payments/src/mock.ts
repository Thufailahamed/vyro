import { md5 } from './hash';
import type {
  GatewayAdapter,
  StartCheckoutInput,
  StartCheckoutResult,
  WebhookEvent,
  RefundInput,
  RefundResult,
} from './types';

export interface MockConfig {
  secret?: string | undefined; // for HMAC body signing
  forceFailure?: boolean | undefined;
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
    const params = new URLSearchParams(rawBody);
    const raw: Record<string, string> = {};
    params.forEach((v, k) => (raw[k] = v));

    if (this.cfg.forceFailure && raw['type'] === 'payment.success') {
      throw new Error('mock: forced failure');
    }

    // Verify md5 signature if present
    if (signature) {
      const merchantId = raw.merchant_id ?? 'mock';
      const orderId = raw.order_id ?? '';
      const amount = raw.payhere_amount ?? '';
      const currency = raw.payhere_currency ?? '';
      const status = raw.type ?? 'payment.success';
      const expected = md5(
        `${merchantId}${orderId}${amount}${currency}${status}${(this.cfg.secret ?? '').toUpperCase()}`,
      );
      if (signature.toUpperCase() !== expected.toUpperCase()) {
        throw new Error('mock webhook signature mismatch');
      }
    }

    const type = (raw.type as WebhookEvent['type']) ?? 'payment.success';
    const amountCents = raw.amount
      ? Math.round(parseFloat(raw.amount) * 100)
      : undefined;

    return {
      type,
      gatewayRef: raw.order_id ?? '',
      paymentId: raw.payment_id ?? undefined,
      amountCents,
      currency: raw.payhere_currency ?? 'LKR',
      raw,
    };
  }

  refund(input: RefundInput): Promise<RefundResult> {
    if (this.cfg.forceFailure) {
      return Promise.resolve({
        gatewayRefundId: '',
        status: 'failed',
        raw: { reason: 'mock-forced-failure' },
      });
    }
    return Promise.resolve({
      gatewayRefundId: `MOCK-RFND-${input.refundId}`,
      status: 'completed',
      raw: { input },
    });
  }

  verifySignature(_rawBody: string, _signature: string | null): boolean {
    // mock always passes signature check (no body tampering in dev)
    return true;
  }
}
