import { md5 } from './hash';
import type {
  GatewayAdapter,
  StartCheckoutInput,
  StartCheckoutResult,
  WebhookEvent,
  WebhookEventType,
  RefundInput,
  RefundResult,
} from './types';

export interface PayHereConfig {
  merchantId: string;
  merchantSecret: string;
  sandbox: boolean;
  notifyUrl?: string | undefined;
  refundApiUrl?: string | undefined;
}

function baseUrl(sandbox: boolean): string {
  return sandbox ? 'https://sandbox.payhere.lk' : 'https://www.payhere.lk';
}

function checkoutUrl(sandbox: boolean): string {
  return `${baseUrl(sandbox)}/pay/checkout`;
}

function statusCodeToEventType(code: string | undefined): WebhookEventType {
  switch (code) {
    case '2':
      return 'payment.success';
    case '0':
      return 'payment.success'; // treat pending as success-ish (still informational)
    case '-1':
      return 'payment.cancelled';
    case '-2':
      return 'payment.failed';
    case '-3':
      return 'payment.failed';
    default:
      return 'payment.failed';
  }
}

export class PayHereGateway implements GatewayAdapter {
  readonly provider = 'payhere' as const;
  constructor(private readonly cfg: PayHereConfig) {}

  async startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
    const amountStr = (input.amountCents / 100).toFixed(2);
    const secret = this.cfg.merchantSecret.toUpperCase();
    const hash = md5(
      `${this.cfg.merchantId}${input.purchaseOrderId}${amountStr}${input.currency}${secret}`,
    );

    const params = new URLSearchParams({
      merchant_id: this.cfg.merchantId,
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      notify_url: input.notifyUrl,
      order_id: input.purchaseOrderId,
      items: input.description.slice(0, 250),
      currency: input.currency,
      amount: amountStr,
      first_name: input.businessName.slice(0, 100),
      last_name: '',
      email: input.businessEmail,
      phone: input.businessPhone ?? '',
      address: '',
      city: '',
      country: 'Sri Lanka',
      hash,
    });

    const redirectUrl = `${checkoutUrl(this.cfg.sandbox)}?${params.toString()}`;
    const gatewayRef = `${this.cfg.merchantId}-${input.purchaseOrderId}-${Date.now()}`;
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 min
    return { redirectUrl, gatewayRef, expiresAt };
  }

  async parseWebhook(rawBody: string, _signature: string | null): Promise<WebhookEvent> {
    const params = new URLSearchParams(rawBody);
    const raw: Record<string, string> = {};
    params.forEach((v, k) => (raw[k] = v));

    const merchantId = raw.merchant_id ?? '';
    const orderId = raw.order_id ?? '';
    const payhereAmount = raw.payhere_amount ?? '';
    const payhereCurrency = raw.payhere_currency ?? '';
    const statusCode = raw.status_code ?? '';
    const md5sig = raw.md5sig ?? '';

    const expected = md5(
      `${merchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${this.cfg.merchantSecret.toUpperCase()}`,
    );

    if (md5sig.toUpperCase() !== expected.toUpperCase()) {
      throw new Error('PayHere webhook signature mismatch');
    }

    const type = statusCodeToEventType(statusCode);
    const amountCents = payhereAmount
      ? Math.round(parseFloat(payhereAmount) * 100)
      : undefined;

    return {
      type,
      gatewayRef: orderId,
      paymentId: raw.payment_id ?? undefined,
      amountCents,
      currency: payhereCurrency || undefined,
      statusCode: statusCode ? parseInt(statusCode, 10) : undefined,
      raw,
    };
  }

  refund(input: RefundInput): Promise<RefundResult> {
    // PayHere refund REST API is not in standard public docs for sandbox.
    // Real impl would POST to https://www.payhere.lk/merchant/v1/payment/refund
    // with HMAC + form body. Until merchant credentials are issued, surface
    // a clear "not yet wired" outcome so caller can route through offline flow.
    void input;
    return Promise.resolve({
      gatewayRefundId: '',
      status: 'failed',
      raw: { reason: 'payhere-refund-rest-not-configured' },
    });
  }

  verifySignature(rawBody: string, _signature: string | null): boolean {
    try {
      const params = new URLSearchParams(rawBody);
      const merchantId = params.get('merchant_id') ?? '';
      const orderId = params.get('order_id') ?? '';
      const amount = params.get('payhere_amount') ?? '';
      const currency = params.get('payhere_currency') ?? '';
      const status = params.get('status_code') ?? '';
      const md5sig = params.get('md5sig') ?? '';
      const expected = md5(
        `${merchantId}${orderId}${amount}${currency}${status}${this.cfg.merchantSecret.toUpperCase()}`,
      );
      return md5sig.toUpperCase() === expected.toUpperCase();
    } catch {
      return false;
    }
  }
}
