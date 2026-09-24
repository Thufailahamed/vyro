/**
 * Order lifecycle E2E against a REAL database (node:sqlite + every migration).
 *
 * Covers the single transition pipeline and everything hanging off it:
 * guards (roles, reasons, dispute window, payment gate, POD), refunds on
 * cancel (gateway / queued / credit), partial accept, returns (RMA), the
 * lifecycle cron (auto-cancel, auto-complete, SLA) and dispute resolution.
 * Only the session middleware is stubbed.
 */
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';

const nodeSqlite = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const req = require('node:sqlite') as typeof import('node:sqlite');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const url = require('node:url') as typeof import('node:url');
  return { DatabaseSync: req.DatabaseSync, fs, path, url };
});
type DatabaseSync = InstanceType<typeof nodeSqlite.DatabaseSync>;

const actor = vi.hoisted(() => ({ ctx: null as any }));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (!actor.ctx) throw new Error('test: no ctx set');
    c.set('ctx', actor.ctx);
    await next();
  },
}));

function makeD1(sqlite: DatabaseSync): D1Database {
  const wrap = (sqlText: string, bound: unknown[] = []): D1PreparedStatement => {
    const st = {
      bind(...params: unknown[]) { return wrap(sqlText, [...bound, ...params]); },
      first: async (col?: string) => {
        const row = sqlite.prepare(sqlText).get(...bound) as Record<string, unknown> | undefined;
        if (!row) return null;
        return col ? (row[col] ?? null) : row;
      },
      all: async () => ({ results: sqlite.prepare(sqlText).all(...bound), success: true, meta: {} }),
      run: async () => {
        const r = sqlite.prepare(sqlText).run(...bound) as unknown as { changes: unknown; lastInsertRowid: unknown };
        return { success: true, meta: { changes: Number(r.changes), last_row_id: r.lastInsertRowid } };
      },
      raw: async () => (sqlite.prepare(sqlText).all(...bound) as Record<string, unknown>[]).map((r) => Object.values(r)),
    };
    return st as unknown as D1PreparedStatement;
  };
  return {
    prepare: (sqlText: string) => wrap(sqlText),
    exec: async (sqlText: string) => { sqlite.exec(sqlText); },
    batch: async (stmts: D1PreparedStatement[]) => {
      const out = [];
      for (const s of stmts) out.push(await (s as unknown as { run(): Promise<unknown> }).run());
      return out as never;
    },
  } as unknown as D1Database;
}

const r2 = new Map<string, Uint8Array>();
const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  PAYHERE_MOCK: '1',
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  INVOICES: {
    put: async (k: string, b: ArrayBuffer) => { r2.set(k, new Uint8Array(b)); },
    get: async (k: string) => (r2.has(k) ? { body: r2.get(k), httpMetadata: { contentType: 'image/png' } } : null),
  },
};

const DAY = 86_400_000;
const M: Record<string, any> = {};
let app: Hono;
let db: any;
let schema: any;
let newId: () => string;
const ids: Record<string, string> = {};

const buyer = () => ({ userId: 'buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });
const viewer = () => ({ userId: 'viewer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'viewer' }], suppliers: [] });
const supplier = () => ({ userId: 'sup-u', isAdmin: false, adminRole: null, businesses: [], suppliers: [{ supplierId: ids.sup, role: 'owner' }] });
const admin = () => ({ userId: 'admin', isAdmin: true, adminRole: 'super_admin', businesses: [], suppliers: [] });

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

const PRICE = 10_000; // LKR 100.00 per unit

/** Pending PO with one or two lines, stock reserved like checkout. */
async function mkPo(opts: { qty?: number; qty2?: number; createdAt?: number } = {}) {
  const qty = opts.qty ?? 10;
  const now = opts.createdAt ?? Date.now();
  const poId = newId();
  const lines = [{ sp: ids.spRice, qty, name: 'Rice' }];
  if (opts.qty2) lines.push({ sp: ids.spDhal, qty: opts.qty2, name: 'Dhal' });
  const total = lines.reduce((s, l) => s + l.qty * PRICE, 0);
  await db.insert(schema.purchaseOrders).values({
    id: poId, poNumber: `PO-T-${poId.slice(-8)}`, businessId: ids.biz, supplierId: ids.sup, status: 'pending',
    subtotalCents: total, deliveryFeeCents: 0, totalCents: total, currency: 'LKR',
    deliveryAddress: '1 Main', deliveryCity: 'Colombo', deliveryDistrict: 'Colombo',
    createdByUserId: 'buyer', createdAt: now, updatedAt: now,
  });
  for (const l of lines) {
    await db.insert(schema.purchaseOrderItems).values({
      id: newId(), purchaseOrderId: poId, supplierProductId: l.sp, productNameSnapshot: l.name,
      unitPriceCents: PRICE, unitPriceCentsSnapshot: PRICE, quantity: l.qty, requestedQuantity: l.qty, lineTotalCents: l.qty * PRICE,
    });
  }
  await M.inventory.inventoryService.reserveForOrder(env.DB, undefined, poId, lines.map((l) => ({ supplierProductId: l.sp, quantity: l.qty })), 'buyer');
  return { poId, total };
}

async function pay(poId: string, amount: number, method: 'online' | 'bank_transfer' | 'cash', status = 'confirmed') {
  const id = newId();
  const now = Date.now();
  await db.insert(schema.payments).values({
    id, purchaseOrderId: poId, businessId: ids.biz, supplierId: ids.sup, method, status,
    amountCents: amount, feeCents: 0, netCents: amount, currency: 'LKR',
    gatewayRef: method === 'online' ? `gw-${id}` : null, confirmedAt: status === 'confirmed' ? now : null,
    createdAt: now, updatedAt: now,
  });
  return id;
}

const po = async (id: string) => db.select().from(schema.purchaseOrders).where(M.drizzle.eq(schema.purchaseOrders.id, id)).get();
const offer = async (id: string) => db.select().from(schema.supplierProducts).where(M.drizzle.eq(schema.supplierProducts.id, id)).get();
const refundsFor = async (poId: string) =>
  db.select().from(schema.refunds).where(M.drizzle.eq(schema.refunds.purchaseOrderId, poId)).all();
const move = (poId: string, to: string, role: 'business' | 'supplier' | 'admin' | 'system', reason?: string, opts?: any) =>
  M.lifecycle.applyTransition(env, { poId, to, actor: { role, userId: role === 'system' ? null : role === 'business' ? 'buyer' : role === 'supplier' ? 'sup-u' : 'admin' }, reason: reason ?? null, ...(opts ? { opts } : {}) });

async function advanceTo(poId: string, target: 'accepted' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered') {
  const path = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];
  for (const to of path) {
    if (to === 'out_for_delivery') {
      // Payment gate: default to cash-on-delivery unless the test already paid.
      const s = await M.summary.getPaymentSummary(env.DB, poId);
      if (!['paid', 'partially_refunded', 'cod_pending', 'credit'].includes(s.state)) await pay(poId, s.dueCents, 'cash', 'pending');
    }
    if (to === 'delivered') {
      await M.deliveries.ensureDelivery(env.DB, poId);
      await M.deliveries.updateDelivery(env.DB, poId, { recipientName: 'Store', podNote: 'signed' });
    }
    await move(poId, to, 'supplier');
    if (to === target) return;
  }
}

beforeAll(async () => {
  const sqlite: DatabaseSync = new nodeSqlite.DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  env.DB = makeD1(sqlite);
  const root = nodeSqlite.path.join(nodeSqlite.path.dirname(nodeSqlite.url.fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const migDir = nodeSqlite.path.join(root, 'packages/db/migrations');
  for (const f of nodeSqlite.fs.readdirSync(migDir).filter((x: string) => x.endsWith('.sql')).sort()) {
    sqlite.exec(nodeSqlite.fs.readFileSync(nodeSqlite.path.join(migDir, f), 'utf8').split('--> statement-breakpoint').join(';'));
  }
  M.drizzle = await import('drizzle-orm');
  M.lifecycle = await import('../../src/modules/orders/lifecycle');
  M.accept = await import('../../src/modules/orders/partialAccept');
  M.returns = await import('../../src/modules/returns/service');
  M.cron = await import('../../src/cron/orderLifecycle');
  M.inventory = await import('../../src/modules/inventory/service');
  M.deliveries = await import('../../src/modules/deliveries/repository');
  M.summary = await import('../../src/modules/payments/summary');
  M.executor = await import('../../src/modules/refunds/executor');
  const { getDb } = await import('@vyro/db');
  schema = await import('@vyro/db/schema');
  newId = (await import('@vyro/shared')).newId;
  db = getDb(env.DB);

  const now = Date.now();
  for (const u of ['buyer', 'viewer', 'sup-u', 'admin']) {
    await db.insert(schema.users).values({ id: u, email: `${u}@t.test`, passwordHash: 'x', name: u, status: 'active', adminRole: u === 'admin' ? 'super_admin' : null, createdAt: now, updatedAt: now } as never);
  }
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'shop', name: 'Shop', active: true });
  ids.biz = newId();
  await db.insert(schema.businesses).values({ id: ids.biz, name: 'Buyer Co', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t.test', address: '1 Main', city: 'Colombo', district: 'Colombo', status: 'active', createdAt: now, updatedAt: now } as never);
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: ids.biz, userId: 'buyer', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: ids.biz, userId: 'viewer', role: 'viewer', status: 'active', createdAt: now, updatedAt: now });
  ids.sup = newId();
  await db.insert(schema.suppliers).values({ id: ids.sup, name: 'Mill Co', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t.test', address: '2 Mill', city: 'Colombo', district: 'Colombo', status: 'active', createdAt: now, updatedAt: now } as never);
  await db.insert(schema.supplierMembers).values({ id: newId(), supplierId: ids.sup, userId: 'sup-u', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const cat = newId();
  await db.insert(schema.categories).values({ id: cat, slug: 'staples', name: 'Staples' } as never);
  for (const [key, name] of [['spRice', 'Rice'], ['spDhal', 'Dhal']] as const) {
    const pid = newId();
    await db.insert(schema.products).values({ id: pid, name, categoryId: cat, unit: 'kg', createdAt: now, updatedAt: now } as never);
    ids[key] = newId();
    await db.insert(schema.supplierProducts).values({ id: ids[key], supplierId: ids.sup, productId: pid, priceCents: PRICE, minOrderQty: 1, stockQty: 1000, trackInventory: true, leadTimeDays: 2, createdAt: now, updatedAt: now } as never);
  }
  // Automation cutoff in the past so aged test orders are eligible.
  await db.insert(schema.configSections).values({ section: 'order_lifecycle', valueJson: JSON.stringify({ automationSince: 1 }), version: 0, updatedAt: now });

  const poRouter = (await import('../../src/modules/purchaseOrders/routes')).default;
  const { poReturnsRouter, returnsRouter } = await import('../../src/modules/returns/routes');
  const deliveryRouter = (await import('../../src/modules/deliveries/routes')).default;
  const disputeRouter = (await import('../../src/modules/admin/disputes')).default;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  app.route('/api/purchase-orders', poRouter);
  app.route('/api/purchase-orders', poReturnsRouter);
  app.route('/api/returns', returnsRouter);
  app.route('/api/deliveries', deliveryRouter);
  app.route('/api/admin', disputeRouter);
}, 120_000);

describe('transition pipeline: guards', () => {
  it('rejects illegal edges and wrong actors', async () => {
    const { poId } = await mkPo();
    await expect(move(poId, 'preparing', 'supplier')).rejects.toMatchObject({ status: 409 });
    await expect(move(poId, 'accepted', 'business')).rejects.toMatchObject({ status: 409 });
  });

  it('requires a reason to reject / cancel / dispute', async () => {
    const { poId } = await mkPo();
    await expect(move(poId, 'rejected', 'supplier')).rejects.toMatchObject({ status: 422, code: 'REASON_REQUIRED' });
    await move(poId, 'rejected', 'supplier', 'out of stock');
    const row = await po(poId);
    expect(row.status).toBe('rejected');
    expect(row.rejectionReason).toBe('out of stock');
  });

  it('read-only buyer members cannot cancel via the API', async () => {
    const { poId } = await mkPo();
    actor.ctx = viewer();
    const r = await api('POST', `/api/purchase-orders/${poId}/transition`, { to: 'cancelled', reason: 'changed my mind' });
    expect(r.status).toBe(403);
    actor.ctx = buyer();
    const ok = await api('POST', `/api/purchase-orders/${poId}/transition`, { to: 'cancelled', reason: 'changed my mind' });
    expect(ok.status).toBe(200);
  });

  it('compare-and-set: a stale expectedFrom loses with 409 and does nothing', async () => {
    const { poId } = await mkPo();
    await move(poId, 'accepted', 'supplier');
    await expect(move(poId, 'cancelled', 'system', 'auto', { expectedFrom: 'pending' })).rejects.toMatchObject({ status: 409 });
    expect((await po(poId)).status).toBe('accepted');
  });

  it('supplier can cancel after accepting (stock-out) and stock is released', async () => {
    const before = (await offer(ids.spRice)).reservedQty;
    const { poId } = await mkPo({ qty: 7 });
    expect((await offer(ids.spRice)).reservedQty).toBe(before + 7);
    await move(poId, 'accepted', 'supplier');
    await move(poId, 'cancelled', 'supplier', 'warehouse flood');
    const row = await po(poId);
    expect(row.cancelledByRole).toBe('supplier');
    expect((await offer(ids.spRice)).reservedQty).toBe(before);
  });

  it('proof of delivery is required before a supplier marks delivered', async () => {
    const { poId } = await mkPo();
    await advanceTo(poId, 'out_for_delivery');
    await expect(move(poId, 'delivered', 'supplier')).rejects.toMatchObject({ code: 'POD_REQUIRED' });
    await M.deliveries.updateDelivery(env.DB, poId, { recipientName: 'Kamal', podNote: 'left at back door' });
    await move(poId, 'delivered', 'supplier');
    const delivery = await M.deliveries.findDeliveryByPo(env.DB, poId);
    expect(delivery.status).toBe('delivered');
    // Stock committed on delivery.
    expect((await po(poId)).stockCommittedAt).toBeTruthy();
  });

  it('dispute window: buyer blocked after N days, admin still allowed', async () => {
    const { poId } = await mkPo();
    await advanceTo(poId, 'delivered');
    await db.update(schema.purchaseOrders).set({ deliveredAt: Date.now() - 30 * DAY }).where(M.drizzle.eq(schema.purchaseOrders.id, poId)).run();
    await expect(move(poId, 'disputed', 'business', 'short shipped')).rejects.toMatchObject({ code: 'DISPUTE_WINDOW_CLOSED' });
    await move(poId, 'disputed', 'admin', 'escalated by support');
    const row = await po(poId);
    expect(row.status).toBe('disputed');
    expect(row.disputedAt).toBeTruthy();
    expect(row.disputeReason).toBe('escalated by support');
  });
});

describe('payment gate', () => {
  it('blocks dispatch of an unpaid prepaid order; allows once paid', async () => {
    const { poId, total } = await mkPo();
    await advanceTo(poId, 'ready_for_pickup');
    await expect(move(poId, 'out_for_delivery', 'supplier')).rejects.toMatchObject({ status: 402, code: 'PAYMENT_REQUIRED' });
    await pay(poId, total, 'bank_transfer');
    await move(poId, 'out_for_delivery', 'supplier');
    expect((await po(poId)).status).toBe('out_for_delivery');
  });

  it('cash-on-delivery and credit orders are exempt', async () => {
    const cod = await mkPo();
    await pay(cod.poId, cod.total, 'cash', 'pending');
    await advanceTo(cod.poId, 'out_for_delivery');
    expect((await po(cod.poId)).status).toBe('out_for_delivery');

    const cr = await mkPo();
    await db.insert(schema.creditDrawdowns).values({ id: newId(), businessId: ids.biz, purchaseOrderId: cr.poId, amountCents: cr.total, terms: 'net30', dueAt: Date.now() + 30 * DAY, createdAt: Date.now(), updatedAt: Date.now() });
    await advanceTo(cr.poId, 'out_for_delivery');
    expect((await po(cr.poId)).status).toBe('out_for_delivery');
  });

  it('admin can override the gate', async () => {
    const { poId } = await mkPo();
    await advanceTo(poId, 'ready_for_pickup');
    await move(poId, 'out_for_delivery', 'admin', 'trusted buyer, paying on account');
    expect((await po(poId)).status).toBe('out_for_delivery');
  });
});

describe('money on cancellation', () => {
  it('online payment → refunded through the gateway; payment marked refunded', async () => {
    const { poId, total } = await mkPo();
    const payId = await pay(poId, total, 'online');
    const out = await move(poId, 'cancelled', 'business', 'ordered twice');
    expect(out.refunds).toHaveLength(1);
    expect(out.refunds[0]).toMatchObject({ status: 'completed', amountCents: total });
    const p = await db.select().from(schema.payments).where(M.drizzle.eq(schema.payments.id, payId)).get();
    expect(p.status).toBe('refunded');
    const summary = await M.summary.getPaymentSummary(env.DB, poId);
    expect(summary.state).toBe('refunded');
  });

  it('gateway failure → refund failed, payment stays confirmed', async () => {
    const { poId, total } = await mkPo();
    const payId = await pay(poId, total, 'online');
    env.PAYMENTS_LK_MOCK_FORCE_FAILURE = '1';
    try {
      const out = await move(poId, 'cancelled', 'business', 'ordered twice');
      expect(out.refunds[0].status).toBe('failed');
    } finally {
      delete env.PAYMENTS_LK_MOCK_FORCE_FAILURE;
    }
    const p = await db.select().from(schema.payments).where(M.drizzle.eq(schema.payments.id, payId)).get();
    expect(p.status).toBe('confirmed');
  });

  it('bank transfer → a requested refund queued for ops; unpaid intents voided', async () => {
    const { poId, total } = await mkPo();
    await pay(poId, total, 'bank_transfer');
    const pendingCash = await pay(poId, total, 'cash', 'pending');
    await move(poId, 'rejected', 'supplier', 'cannot deliver to this area');
    const rs = await refundsFor(poId);
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ status: 'requested', source: 'reject', amountCents: total });
    const cash = await db.select().from(schema.payments).where(M.drizzle.eq(schema.payments.id, pendingCash)).get();
    expect(cash.status).toBe('cancelled');
  });

  it('retrying a cancellation side effect never double-refunds (idempotency key)', async () => {
    const { poId, total } = await mkPo();
    await pay(poId, total, 'bank_transfer');
    await move(poId, 'cancelled', 'business', 'dup');
    const again = await M.executor.refundAllForOrder(env, { poId, source: 'cancel', reason: 'retry', actorUserId: 'buyer', keyPrefix: `cancelled:${poId}` });
    expect(again[0]?.reused ?? true).toBe(true);
    expect(await refundsFor(poId)).toHaveLength(1);
  });

  it('credit order → drawdown released and facility usage restored', async () => {
    const { poId, total } = await mkPo();
    await db.insert(schema.creditFacilities).values({ businessId: ids.biz, limitCents: 10_000_000, usedCents: total, createdAt: Date.now(), updatedAt: Date.now() }).onConflictDoUpdate({ target: schema.creditFacilities.businessId, set: { usedCents: total } });
    await db.insert(schema.creditDrawdowns).values({ id: newId(), businessId: ids.biz, purchaseOrderId: poId, amountCents: total, terms: 'net30', dueAt: Date.now() + 30 * DAY, createdAt: Date.now(), updatedAt: Date.now() });
    await move(poId, 'cancelled', 'business', 'no longer needed');
    const dd = await db.select().from(schema.creditDrawdowns).where(M.drizzle.eq(schema.creditDrawdowns.purchaseOrderId, poId)).get();
    expect(dd).toMatchObject({ status: 'released', releasedCents: total });
    const fac = await db.select().from(schema.creditFacilities).where(M.drizzle.eq(schema.creditFacilities.businessId, ids.biz)).get();
    expect(fac.usedCents).toBe(0);
  });
});

describe('partial accept', () => {
  it('reduces lines, recomputes totals, frees stock and refunds the difference', async () => {
    const reservedBefore = (await offer(ids.spDhal)).reservedQty;
    const { poId, total } = await mkPo({ qty: 10, qty2: 5 });
    await pay(poId, total, 'online');
    const items = await db.select().from(schema.purchaseOrderItems).where(M.drizzle.eq(schema.purchaseOrderItems.purchaseOrderId, poId)).all();
    const rice = items.find((i: any) => i.productNameSnapshot === 'Rice');
    const dhal = items.find((i: any) => i.productNameSnapshot === 'Dhal');
    actor.ctx = supplier();
    const r = await api('POST', `/api/purchase-orders/${poId}/accept`, {
      lines: [{ itemId: rice.id, quantity: 6 }, { itemId: dhal.id, unavailable: true, reason: 'out of stock' }],
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ partial: true, originalTotalCents: total, totalCents: 6 * PRICE, reducedByCents: total - 6 * PRICE });
    const row = await po(poId);
    expect(row).toMatchObject({ status: 'accepted', totalCents: 6 * PRICE, originalTotalCents: total });
    const after = await db.select().from(schema.purchaseOrderItems).where(M.drizzle.eq(schema.purchaseOrderItems.purchaseOrderId, poId)).all();
    expect(after.find((i: any) => i.id === rice.id)).toMatchObject({ quantity: 6, requestedQuantity: 10, fulfilmentStatus: 'reduced' });
    expect(after.find((i: any) => i.id === dhal.id)).toMatchObject({ quantity: 0, fulfilmentStatus: 'unavailable' });
    expect((await offer(ids.spDhal)).reservedQty).toBe(reservedBefore);
    const rs = await refundsFor(poId);
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ status: 'completed', source: 'partial_accept', amountCents: total - 6 * PRICE });
    // Paid order that was trimmed is still fully paid for its new total.
    expect((await M.summary.getPaymentSummary(env.DB, poId)).state).toBe('partially_refunded');
  });

  it('all lines unavailable → 422, order stays pending', async () => {
    const { poId } = await mkPo({ qty: 3 });
    const [item] = await db.select().from(schema.purchaseOrderItems).where(M.drizzle.eq(schema.purchaseOrderItems.purchaseOrderId, poId)).all();
    await expect(
      M.accept.acceptOrder(env, { poId, actor: { role: 'supplier', userId: 'sup-u' }, lines: [{ itemId: item.id, unavailable: true }], note: null }),
    ).rejects.toMatchObject({ code: 'NOTHING_TO_ACCEPT' });
    expect((await po(poId)).status).toBe('pending');
  });

  it('cannot accept more than ordered', async () => {
    const { poId } = await mkPo({ qty: 3 });
    const [item] = await db.select().from(schema.purchaseOrderItems).where(M.drizzle.eq(schema.purchaseOrderItems.purchaseOrderId, poId)).all();
    await expect(
      M.accept.acceptOrder(env, { poId, actor: { role: 'supplier', userId: 'sup-u' }, lines: [{ itemId: item.id, quantity: 4 }], note: null }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('returns (RMA)', () => {
  it('request → approve → receive: restocks, refunds, issues a credit note, holds then releases settlement', async () => {
    const { poId, total } = await mkPo({ qty: 10 });
    await pay(poId, total, 'online');
    await advanceTo(poId, 'delivered');
    const stockAfterDelivery = (await offer(ids.spRice)).stockQty;
    const [item] = await db.select().from(schema.purchaseOrderItems).where(M.drizzle.eq(schema.purchaseOrderItems.purchaseOrderId, poId)).all();

    actor.ctx = buyer();
    const created = await api('POST', `/api/purchase-orders/${poId}/returns`, { reasonCode: 'damaged', reasonNote: 'wet bags', lines: [{ itemId: item.id, quantity: 3 }] });
    expect(created.status).toBe(201);
    const ret = created.body.return;
    expect(ret).toMatchObject({ status: 'requested', refundCents: 3 * PRICE });

    // Over-claiming the same units is rejected.
    const over = await api('POST', `/api/purchase-orders/${poId}/returns`, { reasonCode: 'damaged', lines: [{ itemId: item.id, quantity: 8 }] });
    expect(over.status).toBe(400);

    // Auto-complete must skip an order with an open return.
    await db.update(schema.purchaseOrders).set({ deliveredAt: Date.now() - 10 * DAY }).where(M.drizzle.eq(schema.purchaseOrders.id, poId)).run();
    await M.cron.handleOrderLifecycle(env);
    expect((await po(poId)).status).toBe('delivered');

    // Buyer can't approve their own return.
    expect((await api('POST', `/api/returns/${ret.id}/approve`, {})).status).toBe(403);
    actor.ctx = supplier();
    expect((await api('POST', `/api/returns/${ret.id}/approve`, { note: 'send back via courier' })).body.return.status).toBe('approved');
    const received = await api('POST', `/api/returns/${ret.id}/receive`, {});
    expect(received.status).toBe(200);
    expect(received.body.return).toMatchObject({ status: 'closed', refundCents: 3 * PRICE });
    expect(received.body.return.creditNoteInvoiceId).toBeTruthy();

    expect((await offer(ids.spRice)).stockQty).toBe(stockAfterDelivery + 3);
    const rs = (await refundsFor(poId)).filter((r: any) => r.source === 'return');
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ status: 'completed', amountCents: 3 * PRICE });
    const note = await db.select().from(schema.invoices).where(M.drizzle.eq(schema.invoices.id, received.body.return.creditNoteInvoiceId)).get();
    expect(note).toMatchObject({ type: 'credit_note', totalCents: 3 * PRICE });

    // Return closed → auto-complete proceeds.
    await M.cron.handleOrderLifecycle(env);
    expect((await po(poId)).status).toBe('completed');
  });

  it('return window is enforced for buyers', async () => {
    const { poId } = await mkPo({ qty: 2 });
    await advanceTo(poId, 'delivered');
    await db.update(schema.purchaseOrders).set({ deliveredAt: Date.now() - 30 * DAY }).where(M.drizzle.eq(schema.purchaseOrders.id, poId)).run();
    const [item] = await db.select().from(schema.purchaseOrderItems).where(M.drizzle.eq(schema.purchaseOrderItems.purchaseOrderId, poId)).all();
    await expect(
      M.returns.createReturn(env, poId, { role: 'business', userId: 'buyer' }, { reasonCode: 'quality', lines: [{ itemId: item.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: 'RETURN_WINDOW_CLOSED' });
  });
});

describe('lifecycle cron', () => {
  it('auto-cancels unanswered pending orders (stamped, stock released) and auto-completes delivered ones', async () => {
    const reservedBefore = (await offer(ids.spRice)).reservedQty;
    const stale = await mkPo({ qty: 4, createdAt: Date.now() - 3 * DAY });
    const fresh = await mkPo({ qty: 1 });
    const done = await mkPo({ qty: 1 });
    await advanceTo(done.poId, 'delivered');
    await db.update(schema.purchaseOrders).set({ deliveredAt: Date.now() - 5 * DAY }).where(M.drizzle.eq(schema.purchaseOrders.id, done.poId)).run();

    const out = await M.cron.handleOrderLifecycle(env);
    expect(out.autoCancelled).toBeGreaterThanOrEqual(1);
    expect(out.autoCompleted).toBeGreaterThanOrEqual(1);
    expect(await po(stale.poId)).toMatchObject({ status: 'cancelled', autoAction: 'auto_cancelled', cancelledByRole: 'system' });
    expect((await po(fresh.poId)).status).toBe('pending');
    expect(await po(done.poId)).toMatchObject({ status: 'completed', autoAction: 'auto_completed' });
    // Stale order's 4 units were released; fresh + done orders keep theirs (done committed).
    expect((await offer(ids.spRice)).reservedQty).toBe(reservedBefore + 1);
  });

  it('never auto-cancels orders placed before automation was switched on', async () => {
    const cfg = await db.select().from(schema.configSections).where(M.drizzle.eq(schema.configSections.section, 'order_lifecycle')).get();
    const since = Date.now() - DAY;
    await db.update(schema.configSections).set({ valueJson: JSON.stringify({ automationSince: since }), version: cfg.version + 1 }).where(M.drizzle.eq(schema.configSections.section, 'order_lifecycle')).run();
    try {
      const legacy = await mkPo({ qty: 1, createdAt: since - DAY });
      await M.cron.handleOrderLifecycle(env);
      expect((await po(legacy.poId)).status).toBe('pending');
    } finally {
      const now = await db.select().from(schema.configSections).where(M.drizzle.eq(schema.configSections.section, 'order_lifecycle')).get();
      await db.update(schema.configSections).set({ valueJson: JSON.stringify({ automationSince: 1 }), version: now.version + 1 }).where(M.drizzle.eq(schema.configSections.section, 'order_lifecycle')).run();
    }
  });

  it('flags SLA breaches once', async () => {
    const { poId } = await mkPo();
    await advanceTo(poId, 'preparing');
    await db.update(schema.purchaseOrders).set({ deliveryPromisedAt: Date.now() - DAY }).where(M.drizzle.eq(schema.purchaseOrders.id, poId)).run();
    const first = await M.cron.handleOrderLifecycle(env);
    expect(first.slaBreaches).toBeGreaterThanOrEqual(1);
    expect((await po(poId)).autoAction).toBe('sla_breach_notified');
    expect(await M.cron.countSlaBreaches(env.DB)).toBeGreaterThanOrEqual(1);
    const second = await M.cron.handleOrderLifecycle(env);
    expect(second.slaBreaches).toBe(0);
  });
});

describe('dispute resolution (real DB)', () => {
  it('release_supplier completes the order so the supplier earning becomes eligible', async () => {
    const { poId, total } = await mkPo();
    const payId = await pay(poId, total, 'bank_transfer');
    const { ensureAllocationAndEarning } = await import('../../src/modules/finance/earnings');
    await ensureAllocationAndEarning(env.DB, payId, 'admin');
    await advanceTo(poId, 'delivered');
    await move(poId, 'disputed', 'business', 'quality issue');
    const held = await db.select().from(schema.supplierEarnings).where(M.drizzle.eq(schema.supplierEarnings.paymentId, payId)).get();
    expect(held.eligibility).toBe('held');

    actor.ctx = admin();
    const r = await api('POST', `/api/admin/disputes/${poId}/resolve`, { outcome: 'release_supplier', note: 'photos show goods fine' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('completed');
    const row = await po(poId);
    expect(row).toMatchObject({ status: 'completed', disputeOutcome: 'release_supplier' });
    expect(row.disputeResolvedAt).toBeTruthy();
    const earning = await db.select().from(schema.supplierEarnings).where(M.drizzle.eq(schema.supplierEarnings.paymentId, payId)).get();
    expect(earning.eligibility).toBe('eligible');
  });

  it('generic override cannot clear a dispute', async () => {
    const { poId } = await mkPo();
    await advanceTo(poId, 'delivered');
    await move(poId, 'disputed', 'admin', 'escalation');
    await expect(move(poId, 'completed', 'admin', 'just close it')).rejects.toMatchObject({ status: 409 });
  });
});
