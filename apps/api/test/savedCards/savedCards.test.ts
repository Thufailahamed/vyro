import { describe, expect, it, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../helpers/d1';

const actor = vi.hoisted(() => ({ ctx: null as any }));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (!actor.ctx) throw new Error('savedCards e2e: no ctx set');
    c.set('ctx', actor.ctx);
    await next();
  },
}));

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

async function api(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await app.fetch(new Request(`http://localhost${path}`, init), env);
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

let app: Hono;

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  const savedCardsRouter = (await import('../../src/modules/savedCards/routes')).default;
  const paymentRouter = (await import('../../src/modules/payments/routes')).default;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  app.route('/api/payments/saved-cards', savedCardsRouter);
  app.route('/api/payments', paymentRouter);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  const biz = newId();
  const sup = newId();
  const bt = newId();
  await db.insert(schema.users).values({
    id: 'owner', email: 'o@t', passwordHash: 'x', name: 'o', phone: null, avatarUrl: null,
    adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null,
  });
  await db.insert(schema.users).values({
    id: 'outsider', email: 'x@t', passwordHash: 'x', name: 'x', phone: null, avatarUrl: null,
    adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null,
  });
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  await db.insert(schema.businesses).values({
    id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t',
    address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
  });
  await db.insert(schema.suppliers).values({
    id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t',
    address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
  });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: biz, userId: 'owner', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({
    id: poId, poNumber: 'PO-SC-1', businessId: biz, supplierId: sup, status: 'pending',
    subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR',
    deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'owner', createdAt: now, updatedAt: now,
  });
  const payId = newId();
  await db.insert(schema.payments).values({
    id: payId, purchaseOrderId: poId, businessId: biz, supplierId: sup, method: 'online', provider: 'payments_lk',
    status: 'pending', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR', createdAt: now, updatedAt: now,
  });
  ids.biz = biz; ids.sup = sup; ids.po = poId; ids.pay = payId;

  const memberships: Record<string, { businesses: Array<{ businessId: string; role: string }>; suppliers: Array<{ supplierId: string; role: string }> }> = {
    owner: { businesses: [{ businessId: biz, role: 'owner' }], suppliers: [] },
    outsider: { businesses: [], suppliers: [] },
  };
  const asCtx = (userId: string) => {
    const m = memberships[userId] ?? { businesses: [], suppliers: [] };
    return { userId, email: `${userId}@t`, isAdmin: false, adminRole: null, businesses: m.businesses, suppliers: m.suppliers };
  };
  (ids as any).asCtx = asCtx;
}, 60000);

function cardSavedBody(paymentId: string): string {
  return JSON.stringify({
    id: 'evt_card_1',
    type: 'card.saved',
    data: { reference: paymentId, card: { id: 'card_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 } },
  });
}

describe('saved cards', () => {
  it('card.saved webhook persists the card; duplicates stay idempotent', async () => {
    const { applyGatewayPaymentEvent } = await import('../../src/modules/webhooks/paymentslk');
    const r = await applyGatewayPaymentEvent(env, {
      type: 'card.saved',
      gatewayRef: ids.pay,
      card: { id: 'card_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
      raw: JSON.parse(cardSavedBody(ids.pay)),
    });
    expect(r.card).toBe('saved');
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const rows = (await db.select().from(schema.savedCards).all()) as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].businessId).toBe(ids.biz);
    expect(rows[0].last4).toBe('4242');
    // duplicate delivery
    await applyGatewayPaymentEvent(env, {
      type: 'card.saved',
      gatewayRef: ids.pay,
      card: { id: 'card_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
      raw: JSON.parse(cardSavedBody(ids.pay)),
    });
    const rows2 = (await db.select().from(schema.savedCards).all()) as any[];
    expect(rows2.length).toBe(1);
    ids.cardId = rows2[0].id;
  });

  it('lists cards for a business member and never exposes PAN data', async () => {
    actor.ctx = (ids as any).asCtx('owner');
    const r = await api('GET', `/api/payments/saved-cards?businessId=${ids.biz}`);
    expect(r.status).toBe(200);
    expect(r.body.cards.length).toBe(1);
    expect(r.body.cards[0].last4).toBe('4242');
    expect(Object.keys(r.body.cards[0])).not.toContain('paymentsLkCardId');
  });

  it('non-members get 403 on list and delete', async () => {
    actor.ctx = (ids as any).asCtx('outsider');
    const list = await api('GET', `/api/payments/saved-cards?businessId=${ids.biz}`);
    expect(list.status).toBe(403);
    const del = await api('DELETE', `/api/payments/saved-cards/${ids.cardId}`);
    expect(del.status).toBe(403);
  });

  it('deletes a card as owner', async () => {
    actor.ctx = (ids as any).asCtx('owner');
    const del = await api('DELETE', `/api/payments/saved-cards/${ids.cardId}`);
    expect(del.status).toBe(200);
    const again = await api('DELETE', `/api/payments/saved-cards/${ids.cardId}`);
    expect(again.status).toBe(404);
  });

  it('checkout charges a saved card off-session (mock) and confirms the payment', async () => {
    actor.ctx = (ids as any).asCtx('owner');
    // Re-seed the card via the webhook path (deleted above), then pay with it.
    const { applyGatewayPaymentEvent } = await import('../../src/modules/webhooks/paymentslk');
    await applyGatewayPaymentEvent(env, {
      type: 'card.saved',
      gatewayRef: ids.pay,
      card: { id: 'card_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
      raw: JSON.parse(cardSavedBody(ids.pay)),
    });
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const card = (await db.select().from(schema.savedCards).all())[0] as any;
    const co = await api('POST', `/api/payments/${ids.pay}/checkout`, { useSavedCardId: card.id });
    expect(co.status).toBe(200);
    expect(co.body.status).toBe('succeeded');
    expect(co.body.isMock).toBe(true);
    const pay = (await db.select().from(schema.payments).where(eq(schema.payments.id, ids.pay)).get()) as any;
    expect(pay.status).toBe('confirmed');
  });
});
