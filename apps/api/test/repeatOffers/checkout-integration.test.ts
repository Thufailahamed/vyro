/**
 * Repeat Offers — checkout integration smoke.
 * Verifies trailing 90d spend lookup hits real SQL via the node:sqlite D1 shim,
 * and that checkout discounts qualifying supplier POs.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

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

const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  METRICS: undefined,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
};

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u1' });
    await next();
  },
}));

vi.mock(import('@vyro/auth'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requireSupplierRole: vi.fn() };
});

vi.mock('../../src/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import app from '../../src/index';

beforeAll(() => {
  const sqlite: DatabaseSync = new nodeSqlite.DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const d1 = makeD1(sqlite);
  env.DB = d1;
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

  const now = Date.now();
  // Seed: 1 business, 2 suppliers, 2 completed POs from biz1 to supA totaling LKR 160k.
  sqlite.exec(`
    INSERT INTO users (id, email, password_hash, name, status, created_at, updated_at)
      VALUES ('u1', 'u1@vyro.lk', 'hash', 'User 1', 'active', ${now}, ${now});
    INSERT INTO business_types (id, slug, name, active)
      VALUES ('bt1', 'retailer', 'Retailer', 1);
    INSERT INTO businesses
      (id, name, business_type_id, contact_person, phone, email, address, city, district, country_code, created_at, updated_at)
      VALUES ('biz1', 'Biz 1', 'bt1', 'cp', '0700', 'a@a.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now});
    INSERT INTO suppliers
      (id, name, business_type_id, contact_person, phone, email, address, city, district, country_code, created_at, updated_at)
      VALUES
        ('supA', 'Supplier A', 'bt1', 'cp', '0700', 'a@a.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now}),
        ('supB', 'Supplier B', 'bt1', 'cp', '0700', 'b@b.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now});
    INSERT INTO purchase_orders
      (id, po_number, business_id, supplier_id, status, subtotal_cents, delivery_fee_cents, total_cents, currency, delivery_address, delivery_city, delivery_district, created_by_user_id, created_at, updated_at, completed_at)
      VALUES
        ('po1', 'PO-001', 'biz1', 'supA', 'completed', 10000000, 0, 10000000, 'LKR', 'addr', 'city', 'dist', 'u1', ${now - 2000}, ${now - 2000}, ${now - 1000}),
        ('po2', 'PO-002', 'biz1', 'supA', 'completed',  6000000, 0,  6000000, 'LKR', 'addr', 'city', 'dist', 'u1', ${now - 1000}, ${now - 1000}, ${now - 500});
  `);
});

describe('repeatOffers — buyer preview integration', () => {
  it('returns supA as qualifying (>LKR 150k trailing 90d)', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/checkout/repeat-offers?businessId=biz1'),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const supAOffer = body.offers.find((o: any) => o.supplierId === 'supA');
    expect(supAOffer).toBeTruthy();
    expect(supAOffer.percent).toBe(10);
    expect(supAOffer.trailingSpendCents).toBe(16000000);
  });

  it('excludes suppliers below threshold', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/checkout/repeat-offers?businessId=biz1'),
      env,
    );
    const body = await res.json() as any;
    expect(body.offers.find((o: any) => o.supplierId === 'supB')).toBeUndefined();
  });

  it('returns 404 when businessId missing', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/checkout/repeat-offers'),
      env,
    );
    expect(res.status).toBe(400);
  });
});
