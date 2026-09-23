/**
 * Wholesale essentials against a REAL database (node:sqlite behind a D1 shim,
 * every migration applied): delivery address book, saved order lists, supplier
 * price-list CSV import/export, VAT/SSCL tax invoices, buyer credit dunning.
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
        const row = sqlite.prepare(sqlText).get(...(bound as never[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        return col ? (row[col] ?? null) : row;
      },
      all: async () => ({ results: sqlite.prepare(sqlText).all(...(bound as never[])), success: true, meta: {} }),
      run: async () => {
        const r = sqlite.prepare(sqlText).run(...(bound as never[])) as unknown as { changes: unknown; lastInsertRowid: unknown };
        return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
      },
      // Array rows like real D1 — object rows would collapse duplicate column names in joins.
      raw: async () => {
        const stmt = sqlite.prepare(sqlText) as unknown as { setReturnArrays(v: boolean): void; all(...a: unknown[]): unknown[] };
        stmt.setReturnArrays(true);
        return stmt.all(...bound);
      },
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

const env: any = { DB: null, NOTIFICATIONS_QUEUE: undefined, ENVIRONMENT: 'test' };
const buyer = { userId: 'buyer', email: 'b@t', isAdmin: false, adminRole: null, businesses: [{ businessId: 'biz1', role: 'owner' }], suppliers: [] };
const stranger = { userId: 'stranger', email: 's@t', isAdmin: false, adminRole: null, businesses: [{ businessId: 'biz2', role: 'owner' }], suppliers: [] };
const supplierUser = { userId: 'sup-u', email: 'su@t', isAdmin: false, adminRole: null, businesses: [], suppliers: [{ supplierId: 'supA', role: 'owner' }] };

let app: Hono;
let sqlite: DatabaseSync;

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
  return { status: res.status, body: json, text, headers: res.headers };
}

beforeAll(async () => {
  sqlite = new nodeSqlite.DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const d1 = makeD1(sqlite);
  env.DB = d1;
  const root = nodeSqlite.path.join(nodeSqlite.path.dirname(nodeSqlite.url.fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const migDir = nodeSqlite.path.join(root, 'packages/db/migrations');
  for (const f of nodeSqlite.fs.readdirSync(migDir).filter((x: string) => x.endsWith('.sql')).sort()) {
    sqlite.exec(nodeSqlite.fs.readFileSync(nodeSqlite.path.join(migDir, f), 'utf8').split('--> statement-breakpoint').join(';'));
  }

  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  app.route('/api/businesses', (await import('../../src/modules/addresses/routes')).default);
  app.route('/api/order-lists', (await import('../../src/modules/orderLists/routes')).default);
  app.route('/api/supplier-products', (await import('../../src/modules/supplierProducts/importExport')).default);

  const { getDb } = await import('@vyro/db');
  const s = await import('@vyro/db/schema');
  const db = getDb(d1);
  const now = Date.now();
  for (const id of ['buyer', 'stranger', 'sup-u']) {
    await db.insert(s.users).values({ id, email: `${id}@t`, passwordHash: 'x', name: id, status: 'active', createdAt: now, updatedAt: now } as never);
  }
  await db.insert(s.businessTypes).values({ id: 'bt', slug: 'retail', name: 'Retail', active: true } as never);
  for (const id of ['biz1', 'biz2']) {
    await db.insert(s.businesses).values({
      id, name: id, businessTypeId: 'bt', contactPerson: 'Nimal', phone: '0771234567', email: `${id}@t`,
      address: '1 Main St', city: 'Colombo', district: 'Colombo', status: 'active', createdAt: now, updatedAt: now,
      taxId: id === 'biz1' ? '114455667-7000' : null,
    } as never);
  }
  await db.insert(s.suppliers).values({
    id: 'supA', name: 'Lanka Foods', businessTypeId: 'bt', contactPerson: 'S', phone: '0112', email: 'a@t',
    address: 'Wh 1', city: 'Kandy', district: 'Kandy', status: 'active', createdAt: now, updatedAt: now,
  } as never);
  await db.insert(s.supplierMembers).values({ id: 'sm1', supplierId: 'supA', userId: 'sup-u', role: 'owner', status: 'active', createdAt: now, updatedAt: now } as never);
  await db.insert(s.categories).values({ id: 'cat', slug: 'rice', name: 'Rice' } as never);
  for (const [id, name] of [['p-rice', 'Samba Rice 25kg'], ['p-dhal', 'Red Dhal 1kg'], ['p-sugar', 'Sugar 50kg']]) {
    await db.insert(s.products).values({ id, name, categoryId: 'cat', unit: 'bag', createdAt: now, updatedAt: now } as never);
  }
  await db.insert(s.supplierProducts).values({
    id: 'sp-rice', supplierId: 'supA', productId: 'p-rice', supplierSku: 'RICE-25', priceCents: 850_000,
    minOrderQty: 2, stockQty: 100, trackInventory: true, createdAt: now, updatedAt: now,
  } as never);
  await db.insert(s.supplierProducts).values({
    id: 'sp-dhal', supplierId: 'supA', productId: 'p-dhal', priceCents: 45_000, minOrderQty: 10,
    stockQty: 0, trackInventory: true, createdAt: now, updatedAt: now,
  } as never);
  await db.insert(s.purchaseOrders).values({
    id: 'po1', poNumber: 'PO-1', businessId: 'biz1', supplierId: 'supA', status: 'delivered',
    subtotalCents: 1_615_000, deliveryFeeCents: 0, totalCents: 1_615_000, currency: 'LKR',
    deliveryAddress: '1 Main St', deliveryCity: 'Colombo', deliveryDistrict: 'Colombo',
    createdByUserId: 'buyer', createdAt: now, updatedAt: now,
  } as never);
  await db.insert(s.purchaseOrderItems).values({
    id: 'poi1', purchaseOrderId: 'po1', supplierProductId: 'sp-rice', productNameSnapshot: 'Samba Rice 25kg',
    unitPriceCents: 850_000, unitPriceCentsSnapshot: 850_000, quantity: 2, lineTotalCents: 1_700_000,
  } as never);
}, 120_000);

describe('delivery address book', () => {
  it('first address becomes default; checkout resolution prefers it', async () => {
    actor.ctx = buyer;
    const a = await api('POST', '/api/businesses/biz1/addresses', { label: 'Galle outlet', address: '22 Fort Rd', city: 'Galle', district: 'Galle', contactName: 'Kamal', phone: '0779998888' });
    expect(a.status).toBe(201);
    expect(a.body.address.isDefault).toBe(true);
    const b = await api('POST', '/api/businesses/biz1/addresses', { label: 'Kandy store', address: '5 Hill St', city: 'Kandy', district: 'Kandy' });
    expect(b.body.address.isDefault).toBe(false);

    const { resolveDeliveryAddress } = await import('../../src/modules/addresses/repository');
    const biz = { id: 'biz1', address: '1 Main St', city: 'Colombo', district: 'Colombo', contactPerson: 'Nimal', phone: '077' };
    expect((await resolveDeliveryAddress(env.DB, biz))!.city).toBe('Galle');
    expect((await resolveDeliveryAddress(env.DB, biz, b.body.address.id))!.city).toBe('Kandy');
    expect(await resolveDeliveryAddress(env.DB, biz, 'nope')).toBeNull();

    // Switching default moves the flag; deleting the default promotes another.
    await api('PATCH', `/api/businesses/biz1/addresses/${b.body.address.id}`, { isDefault: true });
    let list = await api('GET', '/api/businesses/biz1/addresses');
    expect(list.body.addresses.filter((x: any) => x.isDefault).map((x: any) => x.label)).toEqual(['Kandy store']);
    await api('DELETE', `/api/businesses/biz1/addresses/${b.body.address.id}`);
    list = await api('GET', '/api/businesses/biz1/addresses');
    expect(list.body.addresses).toHaveLength(1);
    expect(list.body.addresses[0].isDefault).toBe(true);
  });

  it('isolates tenants', async () => {
    actor.ctx = stranger;
    expect((await api('GET', '/api/businesses/biz1/addresses')).status).toBe(403);
    expect((await api('POST', '/api/businesses/biz1/addresses', { label: 'x', address: 'xxx', city: 'c', district: 'd' })).status).toBe(403);
  });

  it('falls back to the registered address when none are saved', async () => {
    const { resolveDeliveryAddress } = await import('../../src/modules/addresses/repository');
    const r = await resolveDeliveryAddress(env.DB, { id: 'biz2', address: '9 Other', city: 'Jaffna', district: 'Jaffna', contactPerson: 'O', phone: '07' });
    expect(r).toMatchObject({ addressId: null, city: 'Jaffna', contactName: 'O' });
  });
});

describe('saved order lists', () => {
  let listId = '';
  it('creates a list from a past order and reports live pricing', async () => {
    actor.ctx = buyer;
    const r = await api('POST', '/api/order-lists', { businessId: 'biz1', name: 'Weekly staples', fromPurchaseOrderId: 'po1' });
    expect(r.status).toBe(201);
    listId = r.body.list.id;
    const d = await api('GET', `/api/order-lists/${listId}`);
    expect(d.body.items).toHaveLength(1);
    expect(d.body.items[0]).toMatchObject({ quantity: 2, priceCents: 850_000, product: { name: 'Samba Rice 25kg' }, supplier: { name: 'Lanka Foods' } });
    expect(d.body.estimateCents).toBe(1_700_000);
    const all = await api('GET', '/api/order-lists?businessId=biz1');
    expect(all.body.lists[0], JSON.stringify(all.body)).toMatchObject({ name: 'Weekly staples', itemCount: 1 });
  });

  it('adds to cart, raising to MOQ and reporting unfulfillable lines', async () => {
    actor.ctx = buyer;
    await api('PUT', `/api/order-lists/${listId}/items`, { supplierProductId: 'sp-dhal', quantity: 5 });
    await api('PUT', `/api/order-lists/${listId}/items`, { supplierProductId: 'sp-rice', quantity: 1 });
    const r = await api('POST', `/api/order-lists/${listId}/add-to-cart`);
    expect(r.status).toBe(200);
    expect(r.body.added).toEqual([expect.objectContaining({ supplierProductId: 'sp-rice', quantity: 2, raisedToMoq: true })]);
    expect(r.body.skipped).toEqual([expect.objectContaining({ supplierProductId: 'sp-dhal', reason: 'out_of_stock' })]);
    const row = sqlite.prepare('select quantity from cart_items where supplier_product_id = ?').get('sp-rice') as { quantity: number };
    expect(row.quantity).toBe(2);
  });

  it('blocks other businesses and foreign orders', async () => {
    actor.ctx = stranger;
    expect((await api('GET', `/api/order-lists/${listId}`)).status).toBe(403);
    expect((await api('POST', '/api/order-lists', { businessId: 'biz2', name: 'x', fromPurchaseOrderId: 'po1' })).status).toBe(404);
  });

  it('removes items and deletes lists', async () => {
    actor.ctx = buyer;
    const d = await api('GET', `/api/order-lists/${listId}`);
    const dhal = d.body.items.find((i: any) => i.supplierProductId === 'sp-dhal');
    expect((await api('DELETE', `/api/order-lists/${listId}/items/${dhal.id}`)).status).toBe(200);
    expect((await api('DELETE', `/api/order-lists/${listId}`)).status).toBe(200);
    expect((await api('GET', `/api/order-lists/${listId}`)).status).toBe(404);
  });
});

describe('supplier price-list CSV', () => {
  it('exports live offers as a re-importable template', async () => {
    actor.ctx = supplierUser;
    const r = await api('GET', '/api/supplier-products/export?supplierId=supA');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/csv');
    const lines = r.text.trim().split(/\r?\n/);
    expect(lines[0]).toMatch(/^offer_id,product_id,product_name/);
    expect(lines).toHaveLength(3);
  });

  it('dry run reports without writing, then imports updates + creates', async () => {
    actor.ctx = supplierUser;
    const csv = [
      'offer_id,product_id,supplier_sku,price_lkr,min_order_qty,stock_qty,active',
      'sp-rice,,,"8,900.00",,80,',       // update price + stock by offer id
      ',,,,,,',                            // blank padding row is ignored
      ',p-sugar,SUG-50,15000,5,40,yes',   // create new listing
      ',,RICE-25,abc,,,',                  // bad number → error
      ',p-ghost,,100,,,',                  // unknown product → error
    ].join('\n');
    const dry = await api('POST', '/api/supplier-products/import', { supplierId: 'supA', csv, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.summary, JSON.stringify(dry.body.results)).toMatchObject({ rows: 4, created: 1, updated: 1, errors: 2 });
    expect((sqlite.prepare('select price_cents from supplier_products where id = ?').get('sp-rice') as any).price_cents).toBe(850_000);

    const real = await api('POST', '/api/supplier-products/import', { supplierId: 'supA', csv });
    expect(real.body.summary).toMatchObject({ created: 1, updated: 1, errors: 2 });
    expect(real.body.results.find((x: any) => x.row === 5).message).toMatch(/price_lkr must be a number/);
    const rice = sqlite.prepare('select price_cents, stock_qty from supplier_products where id = ?').get('sp-rice') as any;
    expect(rice).toMatchObject({ price_cents: 890_000, stock_qty: 80 });
    const sugar = sqlite.prepare('select price_cents, min_order_qty, stock_qty, supplier_sku from supplier_products where product_id = ?').get('p-sugar') as any;
    expect(sugar).toMatchObject({ price_cents: 1_500_000, min_order_qty: 5, stock_qty: 40, supplier_sku: 'SUG-50' });

    // Re-running the same file is idempotent for updates.
    const again = await api('POST', '/api/supplier-products/import', { supplierId: 'supA', csv: 'offer_id,price_lkr,stock_qty\nsp-rice,8900,80' });
    expect(again.body.summary).toMatchObject({ updated: 0, unchanged: 1 });
  });

  it('rejects non-members and malformed files', async () => {
    actor.ctx = buyer;
    expect((await api('POST', '/api/supplier-products/import', { supplierId: 'supA', csv: 'offer_id,price_lkr\nx,1' })).status).toBe(403);
    actor.ctx = supplierUser;
    expect((await api('POST', '/api/supplier-products/import', { supplierId: 'supA', csv: 'name\nfoo' })).status).toBe(400);
  });
});

describe('tax invoices', () => {
  it('breaks VAT + SSCL out of the paid total and prints the real number', async () => {
    const { getDb } = await import('@vyro/db');
    const s = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const now = Date.now();
    await db.insert(s.supplierSettings).values({
      supplierId: 'supA', vatRegistered: true, vatRegistrationNo: '409988776-7000', ssclRegistered: true,
      createdAt: now, updatedAt: now,
    } as never);
    // PO with a repeat-offer discount: lines 1,700,000 but paid subtotal 1,615,000.
    await db.insert(s.payments).values({
      id: 'pay1', purchaseOrderId: 'po1', businessId: 'biz1', supplierId: 'supA', method: 'online',
      status: 'confirmed', amountCents: 1_615_000, netCents: 1_615_000, createdAt: now, updatedAt: now,
    } as never);
    const { generateTaxInvoiceForPayment } = await import('../../src/modules/invoices/generate');
    const payment = (await db.select().from(s.payments).all())[0]!;
    const out = await generateTaxInvoiceForPayment(env.DB, payment as never);
    const inv = sqlite.prepare('select * from invoices where id = ?').get(out!.id) as any;
    expect(inv.total_cents).toBe(1_615_000); // reconciles to what was paid
    expect(inv.subtotal_cents + inv.sscl_cents + inv.vat_cents).toBe(1_615_000);
    expect(inv.vat_cents).toBeGreaterThan(0);
    expect(inv.sscl_cents).toBeGreaterThan(0);
    expect(inv.supplier_vat_no).toBe('409988776-7000');
    expect(inv.buyer_tax_id).toBe('114455667-7000');
    expect(inv.html_snapshot).toContain(`<strong>${inv.number}</strong>`);
    expect(inv.html_snapshot).not.toContain('<strong>pending</strong>');
    expect(inv.html_snapshot).toContain('Tax Invoice');
    expect(inv.html_snapshot).toContain('Loyalty discount');
    expect(inv.html_snapshot).toContain('VAT (18%)');
  });
});

describe('credit dunning', () => {
  it('sends each stage once and jumps straight to the latest stage', async () => {
    const { getDb } = await import('@vyro/db');
    const s = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const DAY = 86_400_000;
    const now = Date.now();
    await db.insert(s.businessMembers).values({ id: 'bm1', businessId: 'biz1', userId: 'buyer', role: 'owner', status: 'active', createdAt: now, updatedAt: now } as never);
    await db.insert(s.creditDrawdowns).values({
      id: 'dd1', businessId: 'biz1', purchaseOrderId: 'po1', amountCents: 1_615_000, terms: 'net14',
      dueAt: now + 2 * DAY, status: 'active', createdAt: now, updatedAt: now,
    } as never);
    const { handleCreditDunning, stageFor } = await import('../../src/cron/creditDunning');
    expect(stageFor(now + 5 * DAY, now)).toBeNull();
    expect(stageFor(now - 8 * DAY, now)).toBe('overdue_7');

    expect((await handleCreditDunning(env, { now })).reminded).toBe(1);
    expect((await handleCreditDunning(env, { now })).reminded).toBe(0); // same stage → no repeat
    const n1 = sqlite.prepare("select title from notifications where type = 'credit.payment_reminder'").all() as any[];
    expect(n1).toHaveLength(1);
    expect(n1[0].title).toMatch(/due/);

    // Cron missed a week: jump to overdue_7, not replay due_today/overdue_1.
    expect((await handleCreditDunning(env, { now: now + 10 * DAY })).reminded).toBe(1);
    const stage = sqlite.prepare('select last_reminder_stage from credit_drawdowns where id = ?').get('dd1') as any;
    expect(stage.last_reminder_stage).toBe('overdue_7');

    sqlite.prepare("update credit_drawdowns set repaid_cents = amount_cents where id = 'dd1'").run();
    expect((await handleCreditDunning(env, { now: now + 20 * DAY })).reminded).toBe(0);
  });
});
