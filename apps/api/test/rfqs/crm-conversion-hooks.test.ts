/**
 * CRM conversion hooks: markQuoted (rfqs submitQuote) + markOrdered (purchaseOrders checkout).
 * Verifies rfq_suppliers.conversion_status updates flow through the wired hooks.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
vi.setConfig({ testTimeout: 30_000 });

const nodeSqlite = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const req = require('node:sqlite') as typeof import('node:sqlite');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const url = require('node:url') as typeof import('node:url');
  return { DatabaseSync: req.DatabaseSync, fs, path, url };
});
type DatabaseSync = InstanceType<typeof nodeSqlite.DatabaseSync>;

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

const d1: D1Database = (() => {
  const sqlite: DatabaseSync = new nodeSqlite.DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const d = makeD1(sqlite);
  const root = nodeSqlite.path.join(
    nodeSqlite.path.dirname(nodeSqlite.url.fileURLToPath(import.meta.url)),
    '..', '..', '..', '..',
  );
  const migDir = nodeSqlite.path.join(root, 'packages/db/migrations');
  for (const f of nodeSqlite.fs.readdirSync(migDir).filter((x: string) => x.endsWith('.sql')).sort()) {
    sqlite.exec(
      nodeSqlite.fs.readFileSync(nodeSqlite.path.join(migDir, f), 'utf8')
        .split('--> statement-breakpoint').join(';'),
    );
  }
  return d;
})();

const env: any = {
  DB: d1,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  RESEND_API_KEY: undefined,
  EMAIL_FROM: 'no-reply@vyro.local',
};

beforeAll(() => {
  const now = Date.now();
  const sqlite = (d1 as unknown as { prepare: (s: string) => { run: () => unknown } }).prepare;
  // Use raw exec to seed; sqlite handle is private but D1.exec passes through.
  void sqlite;
  (d1 as unknown as { exec: (sql: string) => Promise<void> }).exec(`
    INSERT INTO business_types (id, slug, name, active) VALUES ('bt1', 'wholesale', 'Wholesale', 1);
    INSERT INTO users (id, email, password_hash, name, status, created_at, updated_at)
      VALUES ('u1', 'b@biz.lk', 'h', 'Buyer', 'active', ${now}, ${now});
    INSERT INTO businesses
      (id, name, business_type_id, contact_person, phone, email, address, city, district, country_code, created_at, updated_at)
      VALUES ('biz1', 'Biz 1', 'bt1', 'cp', '0700', 'b@biz.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now});
    INSERT INTO suppliers
      (id, name, business_type_id, contact_person, phone, email, address, city, district, country_code, created_at, updated_at)
      VALUES
        ('supA', 'Supplier A', 'bt1', 'cp', '0700', 'a@a.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now}),
        ('supB', 'Supplier B', 'bt1', 'cp', '0700', 'b@b.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now});
    INSERT INTO rfqs
      (id, rfq_number, business_id, created_by_user_id, title, description, status, currency, is_open, published_at, created_at, updated_at)
      VALUES ('rfq1', 'RFQ-001', 'biz1', 'u1', 'Need 100kg rice', 'desc', 'open', 'LKR', 1, ${now - 1000}, ${now - 1000}, ${now - 1000});
    INSERT INTO rfq_items (id, rfq_id, description, quantity, unit, created_at)
      VALUES ('ri1', 'rfq1', 'rice', 100, 'kg', ${now - 1000});
    INSERT INTO rfq_suppliers (id, rfq_id, supplier_id, status, invited_at)
      VALUES
        ('rs1', 'rfq1', 'supA', 'invited', ${now - 1000}),
        ('rs2', 'rfq1', 'supB', 'invited', ${now - 1000});
    INSERT INTO categories (id, slug, name, active) VALUES ('cat1', 'beverages', 'Beverages', 1);
    INSERT INTO products (id, name, category_id, unit, active, created_at, updated_at, is_export_controlled)
      VALUES ('p1', 'Rice 5kg', 'cat1', 'kg', 1, ${now}, ${now}, 0);
    INSERT INTO supplier_products (id, supplier_id, product_id, price_cents, min_order_qty, active, availability_status, stock_qty, created_at, updated_at)
      VALUES ('sp1', 'supA', 'p1', 1000, 1, 1, 'in_stock', 1000, ${now}, ${now});
    INSERT INTO carts (id, business_id, status, created_at, updated_at) VALUES ('cart1', 'biz1', 'open', ${now}, ${now});
    INSERT INTO cart_items (id, cart_id, supplier_product_id, quantity)
      VALUES ('ci1', 'cart1', 'sp1', 10);
    INSERT INTO purchase_orders
      (id, po_number, business_id, supplier_id, status, currency, subtotal_cents, total_cents,
       delivery_address, delivery_city, delivery_district, created_by_user_id, created_at, updated_at)
      VALUES ('po-99', 'PO-099', 'biz1', 'supA', 'confirmed', 'LKR', 50000, 50000,
              'addr', 'city', 'dist', 'u1', ${now}, ${now});
  `);
});

describe('CRM conversion hooks — submitQuote', () => {
  it('markQuoted updates conversion_status=quoted + quotedAt on rfq_supplier row', async () => {
    const { crm } = await import('../../src/modules/rfqs/crm');
    const { crmRepository } = await import('../../src/modules/rfqs/crmRepository');

    const lead = await crmRepository.findLeadByRfqAndSupplier(d1, 'rfq1', 'supA');
    expect(lead?.conversionStatus).toBeNull();
    await crm.markQuoted(d1, lead!.id);
    const after = await crmRepository.getLeadForSupplier(d1, 'supA', lead!.id);
    expect(after?.conversionStatus).toBe('quoted');
    expect(after?.quotedAt).toBeGreaterThan(0);
  });

  it('markOrdered updates only the winning supplier row', async () => {
    const { crm } = await import('../../src/modules/rfqs/crm');
    const { crmRepository } = await import('../../src/modules/rfqs/crmRepository');

    await crm.markOrdered(d1, 'rfq1', 'supA', 'po-99', 50000);
    const winner = await crmRepository.findLeadByRfqAndSupplier(d1, 'rfq1', 'supA');
    const loser = await crmRepository.findLeadByRfqAndSupplier(d1, 'rfq1', 'supB');
    expect(winner?.conversionStatus).toBe('won');
    expect(winner?.orderId).toBe('po-99');
    expect(winner?.orderValueCents).toBe(50000);
    expect(loser?.conversionStatus).not.toBe('won');
  });

  it('markOrdered silently skips when no rfq_supplier row matches', async () => {
    const { crm } = await import('../../src/modules/rfqs/crm');
    await expect(
      crm.markOrdered(d1, 'ghost-rfq', 'ghost-supplier', 'po-1', 100),
    ).resolves.toBeUndefined();
  });
});
