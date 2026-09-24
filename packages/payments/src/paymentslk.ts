import { hmacSha256Sync, timingSafeEqualHex } from './hash';
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

export interface PaymentsLkConfig {
  /** sk_test_… or sk_live_… bearer secret key. */
  secretKey: string;
  /** Webhook signing secret (dashboard → Developers). */
  webhookSecret: string;
  apiBaseUrl?: string | undefined; // default https://api.payments.lk
}

/** Optional fetch override for unit tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_API_BASE = 'https://api.payments.lk';

/** Internal dedupe code for payment_events (vendor has no numeric codes). */
export function paymentsLkStatusCode(eventType: string): number | undefined {
  switch (eventType) {
    case 'payment.succeeded':
    case 'payment.success':
      return 2;
    case 'payment.failed':
      return -2;
    case 'checkout.expired':
    case 'payment.expired':
      return 0;
    case 'refund.completed':
      return 3;
    case 'refund.failed':
      return -3;
    case 'card.saved':
      return 4;
    default:
      return undefined;
  }
}

export function paymentsLkEventToType(vendorType: string | undefined): WebhookEventType {
  switch (vendorType) {
    case 'payment.succeeded':
      return 'payment.success';
    case 'payment.failed':
      return 'payment.failed';
    case 'checkout.expired':
      return 'payment.expired';
    case 'refund.completed':
      return 'refund.completed';
    case 'refund.failed':
      return 'refund.failed';
    case 'card.saved':
      return 'card.saved';
    default:
      return 'unknown';
  }
}

/** Produces `t=<unix>,v1=<hex>` per the vendor's signing scheme. */
export function buildPaymentsSignatureHeader(
  secret: string,
  rawBody: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const v1 = hmacSha256Sync(secret, `${timestampSeconds}.${rawBody}`);
  return `t=${timestampSeconds},v1=${v1}`;
}

export function verifyPaymentsSignature(
  secret: string,
  rawBody: string,
  header: string | null,
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const pair of header.split(',')) {
    const idx = pair.indexOf('=');
    if (idx > 0) parts[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  const t = Number(parts['t']);
  const v1 = parts['v1'] ?? '';
  if (!Number.isFinite(t) || t <= 0 || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = hmacSha256Sync(secret, `${t}.${rawBody}`);
  return timingSafeEqualHex(v1, expected);
}

export class PaymentsLkGateway implements GatewayAdapter {
  readonly provider = 'payments_lk' as const;
  constructor(
    private readonly cfg: PaymentsLkConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  private base(): string {
    return (this.cfg.apiBaseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, '');
  }

  async startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
    if (input.currency !== 'LKR') throw new Error('payments.lk supports LKR only');
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('invalid amountCents');

    const body: Record<string, unknown> = {
      amountCents: input.amountCents,
      description: input.description.slice(0, 200),
      reference: input.paymentId,
      successUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    };
    if (input.saveCard) body['saveCard'] = true;
    if (input.businessEmail) body['customer'] = { email: input.businessEmail, name: input.businessName };

    const res = await this.fetchImpl(`${this.base()}/v1/checkouts`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.cfg.secretKey}`,
        'idempotency-key': `checkout_${input.paymentId}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json?.url) {
      throw new Error(`payments.lk checkout failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return { redirectUrl: String(json.url), gatewayRef: String(json.id), expiresAt: Date.now() + 30 * 60 * 1000 };
  }

  async parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent> {
    if (!this.verifySignature(rawBody, signature)) {
      throw new Error('payments.lk webhook signature mismatch');
    }
    const parsed = JSON.parse(rawBody) as Record<string, any>;
    const vendorType = typeof parsed?.type === 'string' ? parsed.type : '';
    const type = paymentsLkEventToType(vendorType);
    const data = (parsed?.data ?? {}) as Record<string, any>;
    const payment = (data.payment ?? {}) as Record<string, any>;
    const cardRaw = (data.card ?? payment.card ?? {}) as Record<string, any>;
    const amountCents =
      typeof data.amountCents === 'number'
        ? data.amountCents
        : typeof payment.amountCents === 'number'
          ? payment.amountCents
          : undefined;
    const card = cardRaw?.id
      ? {
          id: String(cardRaw.id),
          brand: cardRaw.brand ? String(cardRaw.brand) : undefined,
          last4: cardRaw.last4 ? String(cardRaw.last4) : undefined,
          expMonth: typeof cardRaw.expMonth === 'number' ? cardRaw.expMonth : undefined,
          expYear: typeof cardRaw.expYear === 'number' ? cardRaw.expYear : undefined,
        }
      : undefined;
    return {
      type,
      gatewayRef: String(data.reference ?? data.checkoutId ?? payment.id ?? ''),
      paymentId: data.id ? String(data.id) : payment.id ? String(payment.id) : undefined,
      amountCents,
      currency: typeof data.currency === 'string' ? data.currency : 'LKR',
      statusCode: paymentsLkStatusCode(vendorType),
      refundId: data.refund?.id ? String(data.refund.id) : typeof data.refundId === 'string' ? data.refundId : undefined,
      card,
      raw: parsed,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const paymentId = input.providerTransactionId || input.paymentGatewayRef;
    const res = await this.fetchImpl(`${this.base()}/v1/refunds`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.cfg.secretKey}`,
        'idempotency-key': `refund_${input.refundId}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ paymentId, amountCents: input.amountCents, reason: input.reason || undefined }),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      return {
        gatewayRefundId: json?.id ? String(json.id) : '',
        status: 'failed',
        raw: { httpStatus: res.status, body: text.slice(0, 300) },
      };
    }
    const status = json?.status === 'succeeded' ? 'completed' : json?.status === 'failed' ? 'failed' : 'pending';
    return { gatewayRefundId: json?.id ? String(json.id) : '', status, raw: json ?? {} };
  }

  verifySignature(rawBody: string, signature: string | null): boolean {
    try {
      return verifyPaymentsSignature(this.cfg.webhookSecret, rawBody, signature);
    } catch {
      return false;
    }
  }

  async chargeSavedCard(input: ChargeSavedCardInput): Promise<ChargeSavedCardResult> {
    const res = await this.fetchImpl(`${this.base()}/v1/cards/${encodeURIComponent(input.cardId)}/charge`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.cfg.secretKey}`,
        'idempotency-key': input.idempotencyKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCents: input.amountCents,
        description: input.description,
        reference: input.reference,
      }),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) return { status: 'failed', error: text.slice(0, 300) };
    if (json?.status !== 'succeeded') {
      return {
        status: 'failed',
        paymentId: json?.id ? String(json.id) : undefined,
        error: `charge status ${json?.status ?? 'unknown'}`,
      };
    }
    return { status: 'succeeded', paymentId: json?.id ? String(json.id) : undefined };
  }

  async getCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResult> {
    const res = await this.fetchImpl(`${this.base()}/v1/checkouts/${encodeURIComponent(checkoutId)}`, {
      headers: { authorization: `Bearer ${this.cfg.secretKey}` },
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json) return { status: 'pending' };
    const status = json?.payment?.status ?? json?.status ?? 'pending';
    if (status === 'succeeded') {
      return { status: 'succeeded', paymentId: json?.payment?.id ? String(json.payment.id) : undefined };
    }
    if (status === 'failed') return { status: 'failed' };
    if (status === 'expired') return { status: 'expired' };
    return { status: 'pending' };
  }
}
