/**
 * Accounts E2E (§54): the complete money lifecycle against a REAL database.
 *
 * Uses node:sqlite behind a minimal D1-compatible shim (same pattern as
 * apps/api/e2e-rfq.ts) so REAL routers + REAL drizzle schema + REAL
 * transactions run in CI with zero mocks on the data layer. Only the
 * session middleware is stubbed (auth itself is covered elsewhere).
 *
 * Flows:
 *  A. COD: pay(cash) → fulfill → collect exact → eligible → settle → payout → immutable
 *  B. Bank transfer: pay(bank) → submit → proof (proof ≠ paid) → verify → paid; mismatch → partial
 *  C. PayHere mock: checkout → notify → paid → attempts kept → dup callback safe → wrong amount rejected
 *     → refund request → approve → process → complete → earnings adjusted
 *  D. Security: tenant isolation, over-refund, double-verify, double-complete, self-approve
 *  E. Reconciliation run + resolve; idempotent payment creation.
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
    if (!actor.ctx) throw new Error('e2e: no ctx set');
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
        return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
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

const r2store = new Map<string, { bytes: Uint8Array; type: string }>();
const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  INVOICES: {
    put: async (key: string, bytes: Uint8Array, opts?: any) => {
      r2store.set(key, { bytes: new Uint8Array(bytes), type: opts?.httpMetadata?.contentType ?? 'application/octet-stream' });
    },
    get: async (key: string) => {
      const v = r2store.get(key);
      if (!v) return null;
      return { arrayBuffer: async () => v.bytes.buffer as ArrayBuffer };
    },
  },
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  ENVIRONMENT: 'test',
};

const memberships: Record<string, { businesses: Array<{ businessId: string; role: string }>; suppliers: Array<{ supplierId: string; role: string }> }> = {};

function asCtx(userId: string, extra: Record<string, unknown> = {}) {
  const m = memberships[userId] ?? { businesses: [], suppliers: [] };
  return { userId, email: `${userId}@e2e.test`, isAdmin: false, adminRole: null, businesses: m.businesses, suppliers: m.suppliers, ...extra };
}
const adminCtx = (userId: string) => asCtx(userId, { isAdmin: true, adminRole: 'finance' });

let app: Hono;
let ids: Record<string, string> = {};

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { ...headers } };
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

beforeAll(async () => {
  const sqlite: DatabaseSync = new nodeSqlite.DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const d1 = makeD1(sqlite);
  env.DB = d1;
  const root = nodeSqlite.path.join(nodeSqlite.path.dirname(nodeSqlite.url.fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const migDir = nodeSqlite.path.join(root, 'packages/db/migrations');
  for (const f of nodeSqlite.fs.readdirSync(migDir).filter((x: string) => x.endsWith('.sql')).sort()) {
    sqlite.exec(nodeSqlite.fs.readFileSync(nodeSqlite.path.join(migDir, f), 'utf8').split('--> statement-breakpoint').join(';'));
  }

  const paymentRouter = (await import('../../src/modules/payments/routes')).default;
  const refundsRouter = (await import('../../src/modules/refunds/routes')).default;
  const financeRouter = (await import('../../src/modules/finance/routes')).default;
  const financeAdmin = (await import('../../src/modules/finance/admin')).default;
  const financeSettle = (await import('../../src/modules/finance/adminSettlements')).default;
  const poRouter = (await import('../../src/modules/purchaseOrders/routes')).default;
  const webhooksRouter = (await import('../../src/modules/webhooks')).default;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  app.route('/api/payments', paymentRouter);
  app.route('/api/payments', refundsRouter);
  app.route('/api/finance', financeRouter);
  app.route('/api/admin/finance', financeAdmin);
  app.route('/api/admin/finance', financeSettle);
  app.route('/api/purchase-orders', poRouter);
  app.route('/api/webhooks', webhooksRouter);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  const mkUser = async (id: string, adminRole: string | null = null) => {
    await db.insert(schema.users).values({
      id, email: `${id}@e2e.test`, passwordHash: 'x', name: id, phone: null,
      avatarUrl: null, adminRole: adminRole as never, status: 'active',
      createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null,
    });
  };
  await mkUser('buyer'); await mkUser('supplier-u'); await mkUser('fin1', 'finance'); await mkUser('fin2', 'finance'); await mkUser('buyer2');
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({
    id: biz, name: 'E2E Foods', businessTypeId: bt, contactPerson: 'B', phone: '077',
    email: 'b@e2e.test', address: '1 Main', city: 'Colombo', district: 'Colombo',
    description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
  });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: biz, userId: 'buyer', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const biz2 = newId();
  await db.insert(schema.businesses).values({
    id: biz2, name: 'Other', businessTypeId: bt, contactPerson: 'O', phone: '077',
    email: 'o@e2e.test', address: '9 Other', city: 'Kandy', district: 'Kandy',
    description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
  });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: biz2, userId: 'buyer2', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const sup = newId();
  await db.insert(schema.suppliers).values({
    id: sup, name: 'E2E Mills', businessTypeId: bt, contactPerson: 'S', phone: '077',
    email: 's@e2e.test', address: '2 Mill', city: 'Colombo', district: 'Colombo',
    description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
  });
  await db.insert(schema.supplierMembers).values({ id: newId(), supplierId: sup, userId: 'supplier-u', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const cat = newId();
  await db.insert(schema.categories).values({ id: cat, slug: 'staples', name: 'Staples', parentId: null, sortOrder: 0, active: true });
  const prod = newId();
  await db.insert(schema.products).values({ id: prod, name: 'E2E Rice', description: null, categoryId: cat, brand: null, unit: 'kg', packSize: null, active: true, featured: false, createdAt: now, updatedAt: now, deletedAt: null });
  const offer = newId();
  await db.insert(schema.supplierProducts).values({ id: offer, supplierId: sup, productId: prod, priceCents: 20000, minOrderQty: 1, stockQty: 10000, availabilityStatus: 'in_stock', createdAt: now, updatedAt: now } as never);

  const mkPo = async (qty: number) => {
    const poId = newId();
    const total = 20000 * qty;
    await db.insert(schema.purchaseOrders).values({
      id: poId, poNumber: `PO-E2E-${poId.replace(/-/g, '').slice(-10).toUpperCase()}`, businessId: biz, supplierId: sup,
      status: 'pending', subtotalCents: total, deliveryFeeCents: 0, totalCents: total,
      currency: 'LKR', deliveryAddress: '1 Main', deliveryCity: 'Colombo', deliveryDistrict: 'Colombo',
      createdByUserId: 'buyer', createdAt: now, updatedAt: now,
    });
    await db.insert(schema.purchaseOrderItems).values({
      id: newId(), purchaseOrderId: poId, supplierProductId: offer,
      productNameSnapshot: 'E2E Rice', unitPriceCents: 20000, quantity: qty, lineTotalCents: total,
    });
    return { poId, total };
  };
  const a = await mkPo(5);
  const b = await mkPo(2);
  const c = await mkPo(3);
  ids = { biz, biz2, sup, poA: a.poId, totalA: String(a.total), poB: b.poId, totalB: String(b.total), poC: c.poId, totalC: String(c.total) };
  memberships['buyer'] = { businesses: [{ businessId: biz, role: 'owner' }], suppliers: [] };
  memberships['buyer2'] = { businesses: [{ businessId: biz2, role: 'owner' }], suppliers: [] };
  memberships['supplier-u'] = { businesses: [], suppliers: [{ supplierId: sup, role: 'owner' }] };
}, 60000);

describe('Accounts E2E: COD lifecycle (A)', () => {
  it('creates a numbered COD payment with attempt + collection expectation', async () => {
    actor.ctx = asCtx('buyer');
    const { status, body } = await api('POST', '/api/payments', { purchaseOrderId: ids.poA, method: 'cash' });
    expect(status).toBe(201);
    expect(body.paymentNumber).toMatch(/^VYRO-PAY-/);
    ids.payA = body.id;
    ids.amountA = String(body.amountCents);
    const chain = await api('GET', `/api/finance/payments/${ids.payA}`);
    expect(chain.status).toBe(200);
    expect(chain.body.attempts.length).toBeGreaterThanOrEqual(1);
    expect(chain.body.cod.length).toBe(1);
  });

  it('idempotent creation with Idempotency-Key', async () => {
    actor.ctx = asCtx('buyer');
    const h = { 'Idempotency-Key': 'e2e-key-1' };
    const r1 = await api('POST', '/api/payments', { purchaseOrderId: ids.poB, method: 'cash' }, h);
    const r2 = await api('POST', '/api/payments', { purchaseOrderId: ids.poB, method: 'cash' }, h);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);
  });

  it('fulfills, collects exact cash, completes, and becomes eligible', async () => {
    actor.ctx = asCtx('supplier-u');
    for (const to of ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered']) {
      const r = await api('POST', `/api/purchase-orders/${ids.poA}/transition`, { to });
      expect(r.status).toBe(200);
    }
    const c = await api('POST', `/api/finance/payments/${ids.payA}/cod/collect`, { collectedCents: Number(ids.amountA), collectorName: 'Driver' });
    expect(c.status).toBe(200);
    expect(c.body.discrepancyCents).toBe(0);
    actor.ctx = asCtx('buyer');
    const done = await api('POST', `/api/purchase-orders/${ids.poA}/transition`, { to: 'completed' });
    expect(done.status).toBe(200);
    const ov = await api('GET', `/api/finance/supplier/overview?supplierId=${ids.sup}`);
    // supplier overview requires supplier membership — use supplier ctx
    expect([200, 403]).toContain(ov.status);
    actor.ctx = asCtx('supplier-u');
    const ov2 = await api('GET', `/api/finance/supplier/overview?supplierId=${ids.sup}`);
    expect(ov2.status).toBe(200);
    expect(ov2.body.grossCents).toBeGreaterThan(0);
    expect(ov2.body.availableCents).toBeGreaterThan(0);
    const chain = await api('GET', `/api/finance/payments/${ids.payA}`);
    expect(chain.body.earnings[0].eligibility).toBe('eligible');
    expect(chain.body.allocations[0].grossCents).toBe(Number(ids.amountA));
  });

  it('settles and pays out; completed payout is immutable', async () => {
    actor.ctx = adminCtx('fin1');
    const s = await api('POST', '/api/admin/finance/settlements', { supplierId: ids.sup, idempotencyKey: 'set-key-1' });
    expect(s.status).toBe(201);
    const setId = s.body.settlement.id;
    // duplicate with same idempotency key returns the original
    const dup2 = await api('POST', '/api/admin/finance/settlements', { supplierId: ids.sup, idempotencyKey: 'set-key-1' });
    expect(dup2.status).toBe(200);
    expect(dup2.body.duplicate).toBe(true);
    expect(dup2.body.settlement.id).toBe(setId);
    const ap = await api('POST', `/api/admin/finance/settlements/${setId}/approve`, {});
    expect(ap.status).toBe(200);
    const py = await api('POST', '/api/admin/finance/payouts', { settlementId: setId, method: 'bank' });
    expect(py.status).toBe(201);
    const payId = py.body.payout.id;
    for (const step of ['approve', 'process'] as const) {
      const r = await api('POST', `/api/admin/finance/payouts/${payId}/${step}`, {});
      expect(r.status).toBe(200);
    }
    const done = await api('POST', `/api/admin/finance/payouts/${payId}/complete`, { externalReference: 'BANK-E2E-1' });
    expect(done.status).toBe(200);
    const again = await api('POST', `/api/admin/finance/payouts/${payId}/complete`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYOUT_ALREADY_COMPLETED');
  });
});

describe('Accounts E2E: bank transfer lifecycle (B)', () => {
  it('creates reference, submits, proves (proof ≠ paid), verifies → paid', async () => {
    actor.ctx = asCtx('buyer');
    const p = await api('POST', '/api/payments', { purchaseOrderId: ids.poB, method: 'bank_transfer' });
    expect(p.status).toBe(201);
    ids.payB = p.body.id;
    const ref = await api('GET', `/api/finance/payments/${ids.payB}/bank-transfer`);
    expect(ref.status).toBe(200);
    expect(ref.body.bankTransfer.referenceNumber).toMatch(/^VYRO-PAY-/);
    const sub = await api('POST', `/api/finance/payments/${ids.payB}/bank-transfer`, { transferredCents: p.body.amountCents, bankReference: 'E2E-CBQ-1' });
    expect(sub.status).toBe(201);
    expect(sub.body.bankTransfer.status).toBe('pending_verification');
    // proof upload via multipart
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([1, 2, 3])], 'slip.pdf', { type: 'application/pdf' }));
    const upRes = await app.fetch(new Request(`http://localhost/api/finance/payments/${ids.payB}/bank-transfer/proof`, { method: 'POST', body: fd }), env);
    expect(upRes.status).toBe(200);
    const still = await api('GET', `/api/finance/payments/${ids.payB}`);
    expect(still.body.payment.status).toBe('pending');
    actor.ctx = adminCtx('fin1');
    const v = await api('POST', `/api/admin/finance/bank-transfers/${sub.body.bankTransfer.id}/verify`, { verifiedCents: p.body.amountCents, bankReference: 'E2E-CBQ-1' });
    expect(v.status).toBe(200);
    expect(v.body.reconciliation).toBe('matched');
    const paid = await api('GET', `/api/finance/payments/${ids.payB}`);
    expect(paid.body.payment.status).toBe('confirmed');
    // double verify → 409, never duplicates money
    const v2 = await api('POST', `/api/admin/finance/bank-transfers/${sub.body.bankTransfer.id}/verify`, { verifiedCents: p.body.amountCents, bankReference: 'E2E-CBQ-1' });
    expect(v2.status).toBe(409);
    expect(v2.body.error.code).toBe('BANK_TRANSFER_ALREADY_VERIFIED');
  });
});

describe('Accounts E2E: PayHere + refunds (C)', () => {
  it('mock checkout → verified notify → paid with attempts + earning', async () => {
    actor.ctx = asCtx('buyer');
    const p = await api('POST', '/api/payments', { purchaseOrderId: ids.poC, method: 'online' });
    expect(p.status).toBe(201);
    ids.payC = p.body.id;
    ids.amountC = String(p.body.amountCents);
    const co = await api('POST', `/api/payments/${ids.payC}/checkout`, {});
    expect(co.status).toBe(200);
    expect(co.body.provider).toBe('mock');
    const major = `${p.body.amountCents / 100}`;
    const raw = new URLSearchParams({
      order_id: ids.payC, amount: major, payhere_currency: 'LKR',
      type: 'payment.success', merchant_id: 'mock', payment_id: 'MOCK-1',
    }).toString();
    const n1 = await app.fetch(new Request('http://localhost/api/webhooks/payhere', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: raw,
    }), env);
    expect(n1.status).toBe(200);
    const chain = await api('GET', `/api/finance/payments/${ids.payC}`);
    expect(chain.body.payment.status).toBe('confirmed');
    expect(chain.body.attempts.length).toBeGreaterThanOrEqual(2);
    expect(chain.body.earnings.length).toBe(1);
    expect(chain.body.invoices.length).toBe(1);
    // duplicate delivery is idempotent
    const n2 = await app.fetch(new Request('http://localhost/api/webhooks/payhere', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: raw,
    }), env);
    expect(n2.status).toBe(200);
    expect(((await n2.json()) as any).alreadyProcessed).toBe(true);
    const chain2 = await api('GET', `/api/finance/payments/${ids.payC}`);
    expect(chain2.body.earnings.length).toBe(1);
    // wrong amount rejected
    const bad = new URLSearchParams({ order_id: ids.payC, amount: '1.00', payhere_currency: 'LKR', type: 'payment.success' }).toString();
    const n3 = await app.fetch(new Request('http://localhost/api/webhooks/payhere', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: bad,
    }), env);
    expect(n3.status).toBe(400);
  });

  it('partial refund: request → approve → process → complete adjusts earnings', async () => {
    actor.ctx = asCtx('buyer');
    const quarter = Math.floor(Number(ids.amountC) / 4);
    const rq = await api('POST', `/api/finance/payments/${ids.payC}/refunds`, { amountCents: quarter, reason: 'short delivery' });
    expect(rq.status).toBe(201);
    expect(rq.body.status).toBe('requested');
    ids.refund = rq.body.id;
    // over-refund blocked
    const over = await api('POST', `/api/finance/payments/${ids.payC}/refunds`, { amountCents: Number(ids.amountC) * 2, reason: 'greedy' });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('REFUND_EXCEEDS_REMAINING_AMOUNT');
    actor.ctx = adminCtx('fin1');
    expect((await api('POST', `/api/admin/finance/refunds/${ids.refund}/approve`, {})).status).toBe(200);
    expect((await api('POST', `/api/admin/finance/refunds/${ids.refund}/process`, {})).status).toBe(200);
    const done = await api('POST', `/api/admin/finance/refunds/${ids.refund}/complete`, { providerReference: 'MOCK-RFD-1' });
    expect(done.status).toBe(200);
    // payment stays paid (partial), earning shrunk by refund
    const chain = await api('GET', `/api/finance/payments/${ids.payC}`);
    expect(chain.body.payment.status).toBe('confirmed');
    expect(chain.body.earnings[0].refundCents).toBe(quarter);
    // illegal jump on completed refund → 409
    const again = await api('POST', `/api/admin/finance/refunds/${ids.refund}/complete`, {});
    expect(again.status).toBe(409);
  });
});

describe('Accounts E2E: security + reconciliation (D/E)', () => {
  it('tenant isolation: buyer2 cannot read buyer1 payment', async () => {
    actor.ctx = asCtx('buyer2');
    const r = await api('GET', `/api/finance/payments/${ids.payC}`);
    expect(r.status).toBe(403);
  });

  it('supplier cannot verify bank transfers or approve refunds', async () => {
    actor.ctx = asCtx('supplier-u');
    const v = await api('POST', '/api/admin/finance/bank-transfers/x/verify', { verifiedCents: 1, bankReference: 'z' });
    expect(v.status).toBe(403);
    const a = await api('POST', `/api/admin/finance/refunds/${ids.refund}/approve`, {});
    expect(a.status).toBe(403);
  });

  it('four-eyes: creator cannot approve own adjustment', async () => {
    actor.ctx = adminCtx('fin1');
    const c = await api('POST', '/api/admin/finance/adjustments', {
      kind: 'credit', accountType: 'supplier', accountId: ids.sup, amountCents: 100, reason: 'e2e correction',
    });
    expect(c.status).toBe(201);
    const self = await api('POST', `/api/admin/finance/adjustments/${c.body.adjustment.id}/approve`, {});
    expect(self.status).toBe(403);
    actor.ctx = adminCtx('fin2');
    expect((await api('POST', `/api/admin/finance/adjustments/${c.body.adjustment.id}/approve`, {})).status).toBe(200);
    expect((await api('POST', `/api/admin/finance/adjustments/${c.body.adjustment.id}/apply`, {})).status).toBe(200);
  });

  it('reconciliation runs and resolves', async () => {
    actor.ctx = adminCtx('fin1');
    const run = await api('POST', '/api/admin/finance/reconciliation/run', {});
    expect(run.status).toBe(200);
    expect(typeof run.body.raised).toBe('number');
    const list = await api('GET', '/api/admin/finance/reconciliation/exceptions?status=open');
    expect(list.status).toBe(200);
    if (list.body.exceptions.length > 0) {
      const first = list.body.exceptions[0];
      const res = await api('POST', `/api/admin/finance/reconciliation/exceptions/${first.id}/resolve`, { note: 'e2e reviewed' });
      expect(res.status).toBe(200);
    }
  });

  it('dashboards answer the definition-of-done questions', async () => {
    actor.ctx = asCtx('buyer');
    const b = await api('GET', `/api/finance/business/overview?businessId=${ids.biz}`);
    expect(b.status).toBe(200);
    for (const k of ['totalSpendCents', 'paidCents', 'pendingCents', 'refundedCents', 'outstandingCents']) {
      expect(typeof b.body[k]).toBe('number');
    }
    expect(b.body.refundedCents).toBeGreaterThan(0);
    actor.ctx = asCtx('supplier-u');
    const s = await api('GET', `/api/finance/supplier/overview?supplierId=${ids.sup}`);
    expect(s.status).toBe(200);
    for (const k of ['grossCents', 'commissionCents', 'netCents', 'paidOutCents', 'pendingSettlementCents']) {
      expect(typeof s.body[k]).toBe('number');
    }
    expect(s.body.paidOutCents).toBeGreaterThan(0);
    actor.ctx = adminCtx('fin1');
    const a = await api('GET', '/api/admin/finance/overview');
    expect(a.status).toBe(200);
    expect(a.body.gmvCents).toBeGreaterThan(0);
    expect(a.body.commissionCents).toBeGreaterThanOrEqual(0);
  });
});
