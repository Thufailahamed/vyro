/**
 * Buyer purchase flow E2E against a REAL database (node:sqlite + every
 * migration) and the REAL routers — the same pattern as test/orders/lifecycle
 * and test/finance/e2e. Only the session middleware is stubbed; role checks
 * that read membership tables hit the seeded rows, so this exercises the
 * same code paths a browser session would.
 *
 * Journey under test:
 *   cart add -> checkout -> PO pending -> stock reserved -> supplier notified
 *   -> COD payment intent (dispatchable) -> supplier accept -> preparing
 *   -> ready_for_pickup -> tracking -> assigned -> picked_up -> in_transit
 *   (PO synced to out_for_delivery) -> delivered w/ POD (stock committed)
 *   -> COD confirmed by supplier -> buyer completes -> return requested
 *   -> approved -> received (restock + refund + credit note) -> closed.
 *
 * Plus guard rails: MOQ/stock gates, role checks, POD requirement, payment
 * gate, return over-claim.
 */
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { makeD1, applyMigrations } from '../helpers/d1';

const actor = vi.hoisted(() => ({ ctx: null as any }));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (!actor.ctx) throw new Error('e2e: no ctx set');
    c.set('ctx', actor.ctx);
    await next();
  },
}));

const r2 = new Map<string, { bytes: Uint8Array; type: string }>();
const queueMsgs: unknown[] = [];
const env: any = {
  DB: null,
  ENVIRONMENT: 'test',
  PAYHERE_MOCK: '1',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  NOTIFICATIONS_QUEUE: {
    send: async (body: unknown) => {
      queueMsgs.push(body);
    },
  },
  INVOICES: {
    put: async (key: string, bytes: ArrayBuffer, opts?: any) => {
      r2.set(key, { bytes: new Uint8Array(bytes), type: opts?.httpMetadata?.contentType ?? 'application/octet-stream' });
    },
    get: async (key: string) => {
      const v = r2.get(key);
      if (!v) return null;
      return { body: v.bytes, arrayBuffer: async () => v.bytes.buffer, httpMetadata: { contentType: v.type } };
    },
  },
};

let app: Hono;
let db: any;
let schema: any;
let drizzle: any;
let newId: () => string;
const ids: Record<string, string> = {};

const UNIT = 12_000; // LKR 120.00
const STOCK = 20;
const MOQ = 2;
const LOW_STOCK = 10;

const buyer = () => ({
  userId: 'buyer',
  isAdmin: false,
  adminRole: null,
  businesses: [{ businessId: ids.biz, role: 'owner' }],
  suppliers: [],
});
const supplier = () => ({
  userId: 'sup-u',
  isAdmin: false,
  adminRole: null,
  businesses: [],
  suppliers: [{ supplierId: ids.sup, role: 'owner' }],
});
const outsider = () => ({
  userId: 'mallory',
  isAdmin: false,
  adminRole: null,
  businesses: [],
  suppliers: [],
});

async function api(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await app.fetch(new Request(`http://localhost${path}`, init), env);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, body: json };
}

const offer = async () =>
  db.select().from(schema.supplierProducts).where(drizzle.eq(schema.supplierProducts.id, ids.sp)).get();
const getPo = async (id: string) =>
  db.select().from(schema.purchaseOrders).where(drizzle.eq(schema.purchaseOrders.id, id)).get();
const notifsFor = async (userId: string) =>
  db.select().from(schema.notifications).where(drizzle.eq(schema.notifications.userId, userId)).all();
const notifTypes = async (userId: string) => (await notifsFor(userId)).map((n: any) => n.type);

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;

  drizzle = await import('drizzle-orm');
  const { getDb } = await import('@vyro/db');
  schema = await import('@vyro/db/schema');
  newId = (await import('@vyro/shared')).newId;
  db = getDb(d1);

  const now = Date.now();
  for (const u of ['buyer', 'sup-u', 'mallory']) {
    await db.insert(schema.users).values({
      id: u,
      email: `${u}@e2e.test`,
      passwordHash: 'x',
      name: u,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    } as never);
  }
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });

  ids.biz = newId();
  await db.insert(schema.businesses).values({
    id: ids.biz,
    name: 'Buyer Co',
    businessTypeId: bt,
    contactPerson: 'Buyer',
    phone: '0771234567',
    email: 'b@e2e.test',
    address: '1 Main St',
    city: 'Colombo',
    district: 'Colombo',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  } as never);
  await db.insert(schema.businessMembers).values({
    id: newId(), businessId: ids.biz, userId: 'buyer', role: 'owner', status: 'active', createdAt: now, updatedAt: now,
  });

  ids.sup = newId();
  await db.insert(schema.suppliers).values({
    id: ids.sup,
    name: 'Mill Co',
    businessTypeId: bt,
    contactPerson: 'Sup',
    phone: '0777654321',
    email: 's@e2e.test',
    address: '2 Mill Rd',
    city: 'Colombo',
    district: 'Colombo',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  } as never);
  await db.insert(schema.supplierMembers).values({
    id: newId(), supplierId: ids.sup, userId: 'sup-u', role: 'owner', status: 'active', createdAt: now, updatedAt: now,
  });

  const cat = newId();
  await db.insert(schema.categories).values({ id: cat, slug: 'staples', name: 'Staples' } as never);
  const pid = newId();
  await db.insert(schema.products).values({ id: pid, name: 'Rice 5kg', categoryId: cat, unit: 'bag', createdAt: now, updatedAt: now } as never);
  ids.sp = newId();
  await db.insert(schema.supplierProducts).values({
    id: ids.sp,
    supplierId: ids.sup,
    productId: pid,
    priceCents: UNIT,
    minOrderQty: MOQ,
    stockQty: STOCK,
    reservedQty: 0,
    lowStockThreshold: LOW_STOCK,
    trackInventory: true,
    leadTimeDays: 2,
    active: true,
    createdAt: now,
    updatedAt: now,
  } as never);

  const cartRouter = (await import('../../src/modules/cart/routes')).default;
  const poRouter = (await import('../../src/modules/purchaseOrders/routes')).default;
  const paymentsRouter = (await import('../../src/modules/payments/routes')).default;
  const deliveryRouter = (await import('../../src/modules/deliveries/routes')).default;
  const { poReturnsRouter, returnsRouter } = await import('../../src/modules/returns/routes');
  const notificationsRouter = (await import('../../src/modules/notifications/routes')).default;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  app.route('/api/cart', cartRouter);
  app.route('/api/purchase-orders', poRouter);
  app.route('/api/purchase-orders', poReturnsRouter);
  app.route('/api/payments', paymentsRouter);
  app.route('/api/deliveries', deliveryRouter);
  app.route('/api/returns', returnsRouter);
  app.route('/api/notifications', notificationsRouter);
}, 120_000);

describe('A. cart + checkout', () => {
  it('rejects below-MOQ and over-stock adds', async () => {
    actor.ctx = buyer();
    const moq = await api('POST', '/api/cart/items', { businessId: ids.biz, supplierProductId: ids.sp, quantity: MOQ - 1 });
    expect(moq.status).toBe(409);
    expect(moq.body.error.code).toBe('BELOW_MOQ');
    const over = await api('POST', '/api/cart/items', { businessId: ids.biz, supplierProductId: ids.sp, quantity: STOCK + 1 });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('outsider cannot touch the cart', async () => {
    actor.ctx = outsider();
    const r = await api('POST', '/api/cart/items', { businessId: ids.biz, supplierProductId: ids.sp, quantity: MOQ });
    expect(r.status).toBe(403);
  });

  it('adds an item and prices the cart', async () => {
    actor.ctx = buyer();
    const add = await api('POST', '/api/cart/items', { businessId: ids.biz, supplierProductId: ids.sp, quantity: 5 });
    expect(add.status).toBe(201);
    const cart = await api('GET', `/api/cart?businessId=${ids.biz}`);
    expect(cart.status).toBe(200);
    expect(cart.body.items).toHaveLength(1);
    expect(cart.body.items[0]).toMatchObject({ quantity: 5, priceCents: UNIT });
    expect(cart.body.items[0].offer.availableQty).toBe(STOCK);
    expect(cart.body.subtotalCents).toBe(5 * UNIT);
  });

  it('checkout creates a pending PO, reserves stock, converts the cart and notifies the supplier', async () => {
    actor.ctx = buyer();
    const out = await api('POST', '/api/purchase-orders/checkout', { businessId: ids.biz, notes: 'e2e' });
    expect(out.status).toBe(201);
    expect(out.body.poIds).toHaveLength(1);
    ids.po = out.body.poIds[0];

    const po = await getPo(ids.po);
    expect(po.status).toBe('pending');
    expect(po.totalCents).toBe(5 * UNIT);
    expect(po.stockReservedAt).toBeTruthy();

    const o = await offer();
    expect(o.stockQty).toBe(STOCK); // not committed yet
    expect(o.reservedQty).toBe(5);

    const moves = await db.select().from(schema.stockMovements).where(drizzle.eq(schema.stockMovements.purchaseOrderId, ids.po)).all();
    expect(moves.some((m: any) => m.reason === 'order_reserved' && m.reservedDelta === 5)).toBe(true);

    const cart = await api('GET', `/api/cart?businessId=${ids.biz}`);
    expect(cart.body.items).toHaveLength(0);

    const supTypes = await notifTypes('sup-u');
    expect(supTypes).toContain('order.placed');
    expect(queueMsgs.length).toBeGreaterThan(0);
  });

  it('checkout twice fails — cart already converted', async () => {
    actor.ctx = buyer();
    const out = await api('POST', '/api/purchase-orders/checkout', { businessId: ids.biz });
    expect(out.status).toBe(400);
  });
});

describe('B. cash-on-delivery payment intent', () => {
  it('records a COD payment and exposes cod_pending', async () => {
    actor.ctx = buyer();
    const pay = await api('POST', '/api/payments', { purchaseOrderId: ids.po, method: 'cash' });
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('pending');
    expect(pay.body.amountCents).toBe(5 * UNIT);
    ids.payment = pay.body.id;

    const cod = await db.select().from(schema.codCollections).where(drizzle.eq(schema.codCollections.paymentId, ids.payment)).get();
    expect(cod.expectedCents).toBe(5 * UNIT);
    expect(cod.status).toBe('pending');

    const summary = await api('GET', `/api/purchase-orders/${ids.po}/payment-summary`);
    expect(summary.body.paymentSummary.state).toBe('cod_pending');
    expect(summary.body.paymentSummary.dueCents).toBe(5 * UNIT);

    expect(await notifTypes('sup-u')).toContain('payment.initiated');
  });
});

describe('C. supplier fulfilment', () => {
  it('buyer cannot accept their own order', async () => {
    actor.ctx = buyer();
    const r = await api('POST', `/api/purchase-orders/${ids.po}/transition`, { to: 'accepted' });
    expect(r.status).toBe(409);
  });

  it('supplier accepts -> accepted', async () => {
    actor.ctx = supplier();
    const r = await api('POST', `/api/purchase-orders/${ids.po}/accept`, { lines: [], note: 'all good' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('accepted');
    expect(r.body.partial).toBe(false);
    expect((await getPo(ids.po)).status).toBe('accepted');
    expect(await notifTypes('buyer')).toContain('order.accepted');
  });

  it('supplier walks preparing -> ready_for_pickup; promised date stamped', async () => {
    actor.ctx = supplier();
    for (const to of ['preparing', 'ready_for_pickup']) {
      const r = await api('POST', `/api/purchase-orders/${ids.po}/transition`, { to });
      expect(r.status).toBe(200);
    }
    const po = await getPo(ids.po);
    expect(po.status).toBe('ready_for_pickup');
    expect(po.deliveryPromisedAt).toBeTruthy();
  });

  it('supplier attaches tracking; buyer is notified', async () => {
    actor.ctx = supplier();
    const r = await api('PATCH', `/api/deliveries/${ids.po}`, {
      carrier: 'DomEx',
      trackingNumber: 'DX-12345',
      trackingUrl: 'https://domex.example/track/DX-12345',
      driverName: 'Nimal',
      driverPhone: '0771112223',
    });
    expect(r.status).toBe(200);
    expect(r.body.delivery.trackingNumber).toBe('DX-12345');
    const buyerTypes = await notifTypes('buyer');
    expect(buyerTypes).toContain('delivery.updated');
  });
});

describe('D. shipping + delivery', () => {
  it('delivery must not jump ahead of the state machine', async () => {
    actor.ctx = supplier();
    const r = await api('POST', `/api/deliveries/${ids.po}/transitions`, { status: 'delivered', recipientName: 'K', podNote: 'x' });
    expect(r.status).toBe(409);
  });

  it('assigned -> picked_up -> in_transit syncs the PO to out_for_delivery', async () => {
    actor.ctx = supplier();
    for (const status of ['assigned', 'picked_up', 'in_transit']) {
      const r = await api('POST', `/api/deliveries/${ids.po}/transitions`, { status });
      expect(r.status).toBe(200);
    }
    const po = await getPo(ids.po);
    expect(po.status).toBe('out_for_delivery'); // COD passes the payment gate
    const d = await api('GET', `/api/deliveries/${ids.po}`);
    expect(d.body.delivery.status).toBe('in_transit');
    expect(d.body.delivery.pickedUpAt).toBeTruthy();
  });

  it('delivered requires proof of delivery', async () => {
    actor.ctx = supplier();
    const r = await api('POST', `/api/deliveries/${ids.po}/transitions`, { status: 'delivered' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('POD_REQUIRED');
  });

  it('delivered with POD: PO delivered, stock committed, buyer notified', async () => {
    actor.ctx = supplier();
    const r = await api('POST', `/api/deliveries/${ids.po}/transitions`, {
      status: 'delivered',
      recipientName: 'Store Manager',
      podNote: 'signed at back door',
    });
    expect(r.status).toBe(200);

    const po = await getPo(ids.po);
    expect(po.status).toBe('delivered');
    expect(po.deliveredAt).toBeTruthy();
    expect(po.stockCommittedAt).toBeTruthy();

    const o = await offer();
    expect(o.stockQty).toBe(STOCK - 5);
    expect(o.reservedQty).toBe(0);

    const moves = await db.select().from(schema.stockMovements).where(drizzle.eq(schema.stockMovements.purchaseOrderId, ids.po)).all();
    expect(moves.some((m: any) => m.reason === 'order_committed' && m.qtyDelta === -5)).toBe(true);

    const d = await api('GET', `/api/deliveries/${ids.po}`);
    expect(d.body.delivery.status).toBe('delivered');
    expect(d.body.delivery.recipientName).toBe('Store Manager');
    expect(await notifTypes('buyer')).toContain('order.delivered');
  });
});

describe('E. money + completion', () => {
  it('supplier confirms the COD collection -> paid, ledger written', async () => {
    actor.ctx = supplier();
    const r = await api('POST', `/api/payments/${ids.payment}/confirm`, { status: 'confirmed' });
    expect(r.status).toBe(200);

    const summary = await api('GET', `/api/purchase-orders/${ids.po}/payment-summary`);
    expect(summary.body.paymentSummary.state).toBe('paid');
    expect(summary.body.paymentSummary.dueCents).toBe(0);

    const ledger = await db.select().from(schema.ledgerEntries).all();
    expect(ledger.some((l: any) => l.accountType === 'business' && l.direction === 'credit')).toBe(true);

    expect(await notifTypes('buyer')).toContain('payment.received');
  });

  it('buyer confirms receipt -> completed', async () => {
    actor.ctx = buyer();
    const r = await api('POST', `/api/purchase-orders/${ids.po}/transition`, { to: 'completed' });
    expect(r.status).toBe(200);
    expect((await getPo(ids.po)).status).toBe('completed');
    expect(await notifTypes('sup-u')).toContain('order.completed');
  });
});

describe('F. return / RMA', () => {
  it('supplier cannot open a return for the buyer', async () => {
    actor.ctx = supplier();
    const items = (await api('GET', `/api/purchase-orders/${ids.po}`)).body.items;
    const r = await api('POST', `/api/purchase-orders/${ids.po}/returns`, {
      reasonCode: 'damaged',
      lines: [{ itemId: items[0].id, quantity: 1 }],
    });
    expect(r.status).toBe(403);
  });

  it('buyer opens a return for 2 of 5 units', async () => {
    actor.ctx = buyer();
    const detail = await api('GET', `/api/purchase-orders/${ids.po}`);
    expect(detail.status).toBe(200);
    ids.item = detail.body.items[0].id;
    const r = await api('POST', `/api/purchase-orders/${ids.po}/returns`, {
      reasonCode: 'damaged',
      reasonNote: 'two bags torn',
      lines: [{ itemId: ids.item, quantity: 2 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.return.status).toBe('requested');
    expect(r.body.return.rmaNumber).toMatch(/^RMA-/);
    expect(r.body.return.refundCents).toBe(2 * UNIT);
    ids.ret = r.body.return.id;
    expect(await notifTypes('sup-u')).toContain('return.requested');
  });

  it('a second return cannot claim the same units', async () => {
    actor.ctx = buyer();
    const r = await api('POST', `/api/purchase-orders/${ids.po}/returns`, {
      reasonCode: 'damaged',
      lines: [{ itemId: ids.item, quantity: 4 }],
    });
    expect(r.status).toBe(400);
  });

  it('buyer cannot approve; supplier approves', async () => {
    actor.ctx = buyer();
    const denied = await api('POST', `/api/returns/${ids.ret}/approve`, {});
    expect(denied.status).toBe(403);
    actor.ctx = supplier();
    const r = await api('POST', `/api/returns/${ids.ret}/approve`, { note: 'send them back' });
    expect(r.status).toBe(200);
    expect(r.body.return.status).toBe('approved');
    expect(await notifTypes('buyer')).toContain('return.updated');
  });

  it('receive: restocks, refunds the received value, closes the RMA', async () => {
    const before = await offer();
    actor.ctx = supplier();
    const items = (await api('GET', `/api/returns/${ids.ret}`)).body.return.items;
    const r = await api('POST', `/api/returns/${ids.ret}/receive`, {
      lines: items.map((i: any) => ({ returnItemId: i.id, quantity: 2, restock: true })),
    });
    expect(r.status).toBe(200);
    expect(r.body.return.status).toBe('closed');
    expect(r.body.return.refundCents).toBe(2 * UNIT);

    const after = await offer();
    expect(after.stockQty).toBe(before.stockQty + 2);

    const moves = await db
      .select()
      .from(schema.stockMovements)
      .where(drizzle.eq(schema.stockMovements.purchaseOrderId, ids.po))
      .all();
    expect(moves.some((m: any) => m.reason === 'order_return_restocked' && m.qtyDelta === 2)).toBe(true);

    // Money moved: a refund row exists for the COD payment.
    const refunds = await db.select().from(schema.refunds).where(drizzle.eq(schema.refunds.purchaseOrderId, ids.po)).all();
    expect(refunds.length).toBeGreaterThan(0);
    expect(refunds.reduce((s: number, x: any) => s + x.amountCents, 0)).toBe(2 * UNIT);
  });

  it('order detail surfaces the whole trail', async () => {
    actor.ctx = buyer();
    const r = await api('GET', `/api/purchase-orders/${ids.po}`);
    expect(r.status).toBe(200);
    expect(r.body.order.status).toBe('completed');
    expect(r.body.delivery.status).toBe('delivered');
    expect(r.body.returns).toHaveLength(1);
    expect(r.body.returns[0].status).toBe('closed');
    const kinds = r.body.events.map((e: any) => `${e.fromStatus}->${e.toStatus}`);
    for (const edge of ['null->pending', 'pending->accepted', 'accepted->preparing', 'preparing->ready_for_pickup', 'ready_for_pickup->out_for_delivery', 'out_for_delivery->delivered', 'delivered->completed']) {
      expect(kinds).toContain(edge);
    }
  });
});
