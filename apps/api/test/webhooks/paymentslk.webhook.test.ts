import { describe, expect, it, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../helpers/d1';

let app: Hono;
const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  ENVIRONMENT: 'test',
};
const ids: Record<string, any> = {};

async function post(path: string, bodyStr: string, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request(`http://localhost${path}`, { method: 'POST', headers, body: bodyStr }),
    env,
  );
}

function successBody(paymentId: string, amountCents: number, providerPaymentId = 'plk_pay_1'): string {
  return JSON.stringify({
    id: `evt_${providerPaymentId}`,
    type: 'payment.succeeded',
    data: { reference: paymentId, amountCents, id: providerPaymentId, currency: 'LKR' },
  });
}

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  const webhooksRouter = (await import('../../src/modules/webhooks')).default;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  app.route('/api/webhooks', webhooksRouter);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  const bt = newId();
  await db.insert(schema.users).values({ id: 'u', email: 'u@t', passwordHash: 'x', name: 'u', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1 Main', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2 Mill', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: 'PO-WH-1', businessId: biz, supplierId: sup, status: 'pending', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: '1 Main', deliveryCity: 'Colombo', deliveryDistrict: 'Colombo', createdByUserId: 'u', createdAt: now, updatedAt: now });
  const payId = newId();
  await db.insert(schema.payments).values({ id: payId, purchaseOrderId: poId, businessId: biz, supplierId: sup, method: 'online', provider: 'payments_lk', status: 'pending', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR', createdAt: now, updatedAt: now });
  ids.biz = biz; ids.sup = sup; ids.po = poId; ids.pay = payId;
}, 60000);

describe('payments.lk webhook route', () => {
  it('confirms a pending payment and writes ledger + event; duplicates are idempotent', async () => {
    const raw = successBody(ids.pay, 10000);
    const r1 = await post('/api/webhooks/payments-lk', raw, { 'content-type': 'application/json' });
    expect(r1.status).toBe(200);

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const pay = (await db.select().from(schema.payments).where(eq(schema.payments.id, ids.pay)).get()) as any;
    expect(pay.status).toBe('confirmed');
    expect(pay.providerTransactionId).toBe('plk_pay_1');
    const events = (await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.paymentId, ids.pay)).all()) as any[];
    expect(events.length).toBe(1);
    expect(events[0].statusCode).toBe(2);

    const r2 = await post('/api/webhooks/payments-lk', raw, { 'content-type': 'application/json' });
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as any).alreadyProcessed).toBe(true);
    const events2 = (await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.paymentId, ids.pay)).all()) as any[];
    expect(events2.length).toBe(1);
  });

  it('rejects a tampered amount with 400', async () => {
    const raw = successBody(ids.pay, 1);
    const r = await post('/api/webhooks/payments-lk', raw, { 'content-type': 'application/json' });
    expect(r.status).toBe(400);
  });

  it('rejects a bad signature from the real gateway adapter with 400', async () => {
    env.PAYMENTS_LK_SECRET_KEY = 'sk_test_x';
    env.PAYMENTS_LK_WEBHOOK_SECRET = 'whsec_x';
    try {
      const raw = successBody(ids.pay, 10000);
      const r = await post('/api/webhooks/payments-lk', raw, {
        'content-type': 'application/json',
        'payments-signature': 't=1,v1=00',
      });
      expect(r.status).toBe(400);
    } finally {
      delete env.PAYMENTS_LK_SECRET_KEY;
      delete env.PAYMENTS_LK_WEBHOOK_SECRET;
    }
  });

  it('accepts a correctly signed event from the real gateway adapter', async () => {
    env.PAYMENTS_LK_SECRET_KEY = 'sk_test_x';
    env.PAYMENTS_LK_WEBHOOK_SECRET = 'whsec_x';
    try {
      // Fresh pending payment for the real-gateway flow.
      const { getDb } = await import('@vyro/db');
      const schema = await import('@vyro/db/schema');
      const { newId } = await import('@vyro/shared');
      const db = getDb(env.DB);
      const now = Date.now();
      const pay2 = newId();
      await db.insert(schema.payments).values({ id: pay2, purchaseOrderId: ids.po, businessId: ids.biz, supplierId: ids.sup, method: 'online', provider: 'payments_lk', status: 'pending', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR', createdAt: now, updatedAt: now });
      const { buildPaymentsSignatureHeader } = await import('@vyro/payments');
      const raw = successBody(pay2, 10000, 'plk_pay_2');
      const r = await post('/api/webhooks/payments-lk', raw, {
        'content-type': 'application/json',
        'payments-signature': buildPaymentsSignatureHeader('whsec_x', raw),
      });
      expect(r.status).toBe(200);
      const pay = (await db.select().from(schema.payments).where(eq(schema.payments.id, pay2)).get()) as any;
      expect(pay.status).toBe('confirmed');
    } finally {
      delete env.PAYMENTS_LK_SECRET_KEY;
      delete env.PAYMENTS_LK_WEBHOOK_SECRET;
    }
  });

  it('expires a pending payment on checkout.expired', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const pay3 = newId();
    await db.insert(schema.payments).values({ id: pay3, purchaseOrderId: ids.po, businessId: ids.biz, supplierId: ids.sup, method: 'online', provider: 'payments_lk', status: 'pending', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR', createdAt: now, updatedAt: now });
    const raw = JSON.stringify({ id: 'evt_exp_1', type: 'checkout.expired', data: { reference: pay3, id: 'ch_exp_1' } });
    const r = await post('/api/webhooks/payments-lk', raw, { 'content-type': 'application/json' });
    expect(r.status).toBe(200);
    const pay = (await db.select().from(schema.payments).where(eq(schema.payments.id, pay3)).get()) as any;
    expect(pay.status).toBe('cancelled');
    // The event type is normalized to the internal vocabulary before storage.
    expect(pay.statusReason).toBe('gateway:payment.expired');
    expect(pay.expiredAt).toBeGreaterThan(0);
  });

  it('finalizes a processing refund on refund.completed', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const refundId = newId();
    await db.insert(schema.refunds).values({
      id: refundId, paymentId: ids.pay, purchaseOrderId: ids.po, amountCents: 2000, currency: 'LKR',
      status: 'processing', refundMethod: 'gateway', source: 'manual', requestedByUserId: 'u',
      gatewayRefundId: 're_gw_1', idempotencyKey: 'wh-refund-1', createdAt: now, updatedAt: now,
    });
    const raw = JSON.stringify({ id: 'evt_ref_1', type: 'refund.completed', data: { reference: ids.pay, refundId: 're_gw_1', amountCents: 2000, id: 'plk_ref_1' } });
    const r = await post('/api/webhooks/payments-lk', raw, { 'content-type': 'application/json' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).refund).toBe('completed');
    const refund = (await db.select().from(schema.refunds).where(eq(schema.refunds.id, refundId)).get()) as any;
    expect(refund.status).toBe('completed');
  });

  it('ignores unknown event types with 200', async () => {
    const raw = JSON.stringify({ id: 'evt_u_1', type: 'payout.something', data: { reference: ids.pay } });
    const r = await post('/api/webhooks/payments-lk', raw, { 'content-type': 'application/json' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).ignored).toBe('payout.something');
  });
});
