import { describe, expect, it } from 'vitest';
import {
  PaymentsLkGateway,
  buildPaymentsSignatureHeader,
  paymentsLkEventToType,
  type FetchLike,
} from './paymentslk';

const SECRET = 'whsec_test_123';
const KEY = 'sk_test_123';
const BODY = JSON.stringify({
  id: 'evt_1',
  type: 'payment.succeeded',
  data: { reference: 'pay_1', amountCents: 350000, currency: 'LKR', id: 'pay_gw_1' },
});

function captureGateway(responder: (url: string, init?: RequestInit) => Promise<Response>): {
  gateway: PaymentsLkGateway;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return {
    gateway: new PaymentsLkGateway({ secretKey: KEY, webhookSecret: SECRET, apiBaseUrl: 'https://api.test' }, fetchImpl),
    calls,
  };
}

function gateway(): PaymentsLkGateway {
  return new PaymentsLkGateway({ secretKey: KEY, webhookSecret: SECRET, apiBaseUrl: 'https://api.test' });
}

function signed(body: string, ts?: number): string {
  return buildPaymentsSignatureHeader(SECRET, body, ts);
}

function okJson(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

describe('payments.lk webhook verification', () => {
  it('accepts a correctly signed event and maps fields', async () => {
    const ev = await gateway().parseWebhook(BODY, signed(BODY));
    expect(ev.type).toBe('payment.success');
    expect(ev.gatewayRef).toBe('pay_1');
    expect(ev.paymentId).toBe('pay_gw_1');
    expect(ev.amountCents).toBe(350000);
    expect(ev.currency).toBe('LKR');
    expect(ev.statusCode).toBe(2);
  });

  it('rejects a forged signature', async () => {
    await expect(gateway().parseWebhook(BODY, 't=1,v1=00')).rejects.toThrow(/signature mismatch/);
    await expect(gateway().parseWebhook(BODY, null)).rejects.toThrow(/signature mismatch/);
  });

  it('rejects a tampered amount (HMAC binds exact bytes)', async () => {
    const tampered = BODY.replace('"amountCents":350000', '"amountCents":100');
    expect(gateway().verifySignature(tampered, signed(BODY))).toBe(false);
    await expect(gateway().parseWebhook(tampered, signed(BODY))).rejects.toThrow(/signature mismatch/);
  });

  it('rejects an expired timestamp beyond tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(gateway().verifySignature(BODY, signed(BODY, old))).toBe(false);
  });

  it('maps failed, expired, refund and card events', async () => {
    const mk = (vendorType: string, data: Record<string, unknown>) =>
      JSON.stringify({ id: 'evt_x', type: vendorType, data });
    const parse = async (s: string) => gateway().parseWebhook(s, signed(s));

    const failed = await parse(mk('payment.failed', { reference: 'p1' }));
    expect(failed.type).toBe('payment.failed');
    expect(failed.statusCode).toBe(-2);

    const expired = await parse(mk('checkout.expired', { reference: 'p1' }));
    expect(expired.type).toBe('payment.expired');
    expect(expired.statusCode).toBe(0);

    const refundEv = await parse(mk('refund.completed', { reference: 'p1', refundId: 're_1', amountCents: 100 }));
    expect(refundEv.type).toBe('refund.completed');
    expect(refundEv.refundId).toBe('re_1');
    expect(refundEv.statusCode).toBe(3);

    const cardEv = await parse(
      mk('card.saved', { reference: 'p1', card: { id: 'card_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 } }),
    );
    expect(cardEv.type).toBe('card.saved');
    expect(cardEv.card?.id).toBe('card_1');
    expect(cardEv.card?.brand).toBe('visa');
    expect(cardEv.card?.last4).toBe('4242');
    expect(cardEv.card?.expMonth).toBe(12);
    expect(cardEv.card?.expYear).toBe(2030);
    expect(cardEv.statusCode).toBe(4);
  });

  it('maps unknown vendor events to "unknown"', async () => {
    const raw = JSON.stringify({ id: 'evt_x', type: 'something.new', data: { reference: 'p1' } });
    const ev = await gateway().parseWebhook(raw, signed(raw));
    expect(ev.type).toBe('unknown');
    expect(paymentsLkEventToType('something.new')).toBe('unknown');
  });
});

const CHECKOUT_INPUT = {
  paymentId: 'pay_1',
  purchaseOrderId: 'po_1',
  amountCents: 145000,
  currency: 'LKR',
  businessName: 'Acme',
  businessEmail: 'a@b.c',
  supplierName: 'Sup',
  description: 'PO VYRO-1',
  returnUrl: 'https://x/return',
  cancelUrl: 'https://x/cancel',
  notifyUrl: 'https://x/notify',
};

describe('payments.lk checkout REST calls', () => {
  it('sends bearer key, idempotency key, amountCents and reference', async () => {
    const { gateway: g, calls } = captureGateway(async () =>
      okJson({ id: 'ch_1', url: 'https://pay.payments.lk/checkout/ch_1' }),
    );
    const r = await g.startCheckout(CHECKOUT_INPUT);
    expect(r.gatewayRef).toBe('ch_1');
    expect(r.redirectUrl).toBe('https://pay.payments.lk/checkout/ch_1');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
    expect(calls[0]!.url).toBe('https://api.test/v1/checkouts');
    const init = calls[0]!.init as RequestInit;
    expect(init.method).toBe('POST');
    const headers = Object.fromEntries(new Headers(init.headers));
    expect(headers['authorization']).toBe(`Bearer ${KEY}`);
    expect(headers['idempotency-key']).toBe('checkout_pay_1');
    expect(headers['content-type']).toBe('application/json');
    const payload = JSON.parse(String(init.body));
    expect(payload.amountCents).toBe(145000);
    expect(payload.reference).toBe('pay_1');
    expect(payload.successUrl).toBe('https://x/return');
    expect(payload.cancelUrl).toBe('https://x/cancel');
    expect(payload.customer.email).toBe('a@b.c');
  });

  it('includes saveCard when requested', async () => {
    const { gateway: g, calls } = captureGateway(async () =>
      okJson({ id: 'ch_2', url: 'https://pay.payments.lk/checkout/ch_2' }),
    );
    await g.startCheckout({ ...CHECKOUT_INPUT, saveCard: true });
    expect(JSON.parse(String(calls[0]!.init!.body)).saveCard).toBe(true);
  });

  it('throws on checkout API error', async () => {
    const { gateway: g } = captureGateway(async () => new Response('{"error":"declined"}', { status: 402 }));
    await expect(g.startCheckout(CHECKOUT_INPUT)).rejects.toThrow(/checkout failed \(402\)/);
  });

  it('rejects non-LKR and non-integer amounts', async () => {
    const { gateway: g } = captureGateway(async () => okJson({ id: 'ch', url: 'https://x' }));
    await expect(g.startCheckout({ ...CHECKOUT_INPUT, currency: 'USD' })).rejects.toThrow(/LKR only/);
    await expect(g.startCheckout({ ...CHECKOUT_INPUT, amountCents: 10.5 })).rejects.toThrow(/invalid amountCents/);
  });
});

describe('payments.lk refund REST calls', () => {
  it('sends refund with provider payment id and refund idempotency key', async () => {
    const { gateway: g, calls } = captureGateway(async () => okJson({ id: 're_1', status: 'succeeded' }));
    const r = await g.refund({
      paymentGatewayRef: 'ch_1',
      refundId: 'rf_1',
      amountCents: 5000,
      providerTransactionId: 'pay_gw_1',
    });
    expect(r.status).toBe('completed');
    expect(r.gatewayRefundId).toBe('re_1');
    expect(calls[0]!.url).toBe('https://api.test/v1/refunds');
    const init = calls[0]!.init as RequestInit;
    expect(init.method).toBe('POST');
    const headers = Object.fromEntries(new Headers(init.headers));
    expect(headers['idempotency-key']).toBe('refund_rf_1');
    expect(JSON.parse(String(init.body))).toEqual({ paymentId: 'pay_gw_1', amountCents: 5000, reason: undefined });
  });

  it('falls back to the checkout ref when no provider transaction id is known', async () => {
    const { gateway: g, calls } = captureGateway(async () => okJson({ id: 're_2', status: 'succeeded' }));
    await g.refund({ paymentGatewayRef: 'ch_1', refundId: 'rf_2', amountCents: 1 });
    expect(JSON.parse(String(calls[0]!.init!.body)).paymentId).toBe('ch_1');
  });

  it('surfaces refund API failure as failed result', async () => {
    const { gateway: g } = captureGateway(async () => new Response('{"error":"payment not found"}', { status: 404 }));
    const r = await g.refund({ paymentGatewayRef: 'ch_x', refundId: 'rf_x', amountCents: 1 });
    expect(r.status).toBe('failed');
  });
});

describe('payments.lk saved-card charge', () => {
  it('charges a saved card off-session', async () => {
    const { gateway: g, calls } = captureGateway(async () => okJson({ id: 'pay_gw_9', status: 'succeeded' }));
    const r = await g.chargeSavedCard({
      cardId: 'card_1',
      amountCents: 1000,
      description: 'PO 1',
      reference: 'pay_9',
      idempotencyKey: 'charge_pay_9',
    });
    expect(r.status).toBe('succeeded');
    expect(r.paymentId).toBe('pay_gw_9');
    expect(calls[0]!.url).toBe('https://api.test/v1/cards/card_1/charge');
    const headers = Object.fromEntries(new Headers(calls[0]!.init!.headers));
    expect(headers['idempotency-key']).toBe('charge_pay_9');
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({
      amountCents: 1000,
      description: 'PO 1',
      reference: 'pay_9',
    });
  });

  it('reports failed charge with error', async () => {
    const { gateway: g } = captureGateway(async () => new Response('declined', { status: 402 }));
    const r = await g.chargeSavedCard({
      cardId: 'card_1',
      amountCents: 1000,
      description: 'PO',
      reference: 'pay_1',
      idempotencyKey: 'charge_pay_1',
    });
    expect(r.status).toBe('failed');
    expect(r.error).toContain('declined');
  });

  it('reports non-succeeded charge status as failed', async () => {
    const { gateway: g } = captureGateway(async () => okJson({ id: 'pay_gw_9', status: 'processing' }));
    const r = await g.chargeSavedCard({
      cardId: 'card_1',
      amountCents: 1000,
      description: 'PO',
      reference: 'pay_1',
      idempotencyKey: 'charge_pay_1',
    });
    expect(r.status).toBe('failed');
    expect(r.error).toContain('processing');
  });
});

describe('payments.lk checkout status read', () => {
  it('reads a succeeded checkout', async () => {
    const { gateway: g, calls } = captureGateway(async () =>
      okJson({ id: 'ch_1', payment: { id: 'pay_gw_1', status: 'succeeded' } }),
    );
    const s = await g.getCheckoutStatus!('ch_1');
    expect(s.status).toBe('succeeded');
    expect(s.paymentId).toBe('pay_gw_1');
    expect(calls[0]!.url).toBe('https://api.test/v1/checkouts/ch_1');
  });

  it('maps failed, expired and pending statuses', async () => {
    const failed = captureGateway(async () => okJson({ id: 'ch', payment: { status: 'failed' } }));
    expect((await failed.gateway.getCheckoutStatus!('ch')).status).toBe('failed');
    const expired = captureGateway(async () => okJson({ id: 'ch', status: 'expired' }));
    expect((await expired.gateway.getCheckoutStatus!('ch')).status).toBe('expired');
    const pending = captureGateway(async () => okJson({ id: 'ch', status: 'pending' }));
    expect((await pending.gateway.getCheckoutStatus!('ch')).status).toBe('pending');
  });

  it('returns pending on API error', async () => {
    const { gateway: g } = captureGateway(async () => new Response('nope', { status: 500 }));
    expect((await g.getCheckoutStatus!('ch')).status).toBe('pending');
  });
});
