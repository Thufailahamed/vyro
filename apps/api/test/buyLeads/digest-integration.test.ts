/**
 * BuyLeads — daily digest integration smoke.
 * Verifies the cron handler walks enabled subscriptions, matches against
 * RFQ line-item categories, builds a queue payload, and sends it.
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

const queueSend = vi.fn().mockResolvedValue(undefined);
const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: { send: queueSend },
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  METRICS: undefined,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
};

vi.mock('../../src/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import { runBuyLeadsDigest } from '../../src/cron/buyLeads';

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

  // Seed core dims.
  sqlite.exec(`
    INSERT INTO business_types (id, slug, name, active)
      VALUES ('bt1', 'wholesale', 'Wholesale', 1);
    INSERT INTO users (id, email, password_hash, name, status, created_at, updated_at)
      VALUES ('u1', 'owner@a.lk', 'h', 'Owner A', 'active', ${now}, ${now});
    INSERT INTO businesses
      (id, name, business_type_id, contact_person, phone, email, address, city, district, country_code, created_at, updated_at)
      VALUES ('biz1', 'Biz 1', 'bt1', 'cp', '0700', 'biz@biz.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now});
    INSERT INTO suppliers
      (id, name, business_type_id, contact_person, phone, email, address, city, district, country_code, created_at, updated_at)
      VALUES
        ('supA', 'Supplier A', 'bt1', 'cp', '0700', 'a@a.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now}),
        ('supB', 'Supplier B', 'bt1', 'cp', '0700', 'b@b.lk', 'addr', 'city', 'dist', 'LK', ${now}, ${now});
    INSERT INTO supplier_members
      (id, supplier_id, user_id, role, status, created_at, updated_at)
      VALUES
        ('sm1', 'supA', 'u1', 'owner', 'active', ${now}, ${now}),
        ('sm2', 'supB', 'u1', 'owner', 'active', ${now}, ${now});
    INSERT INTO supplier_buy_lead_subscriptions
      (id, supplier_id, enabled, category_ids_json, created_at, updated_at)
      VALUES
        ('subA', 'supA', 1, '["cat1"]', ${now}, ${now}),
        ('subB', 'supB', 0, '["cat2"]', ${now}, ${now});
    INSERT INTO categories (id, slug, name, active)
      VALUES
        ('cat1', 'beverages', 'Beverages', 1),
        ('cat2', 'snacks', 'Snacks', 1);
    INSERT INTO products
      (id, name, category_id, unit, active, created_at, updated_at, is_export_controlled)
      VALUES
        ('p1', 'Rice 5kg', 'cat1', 'kg', 1, ${now}, ${now}, 0),
        ('p2', 'Biscuits', 'cat2', 'pack', 1, ${now}, ${now}, 0);
  `);

  // Seed: 2 RFQs in cat1 (matching supA), 1 RFQ in cat2 (supB is opted out).
  // Only the cat1 RFQs should fire for supA.
  sqlite.exec(`
    INSERT INTO rfqs
      (id, rfq_number, business_id, created_by_user_id, title, description, status, currency, is_open, published_at, created_at, updated_at)
      VALUES
        ('rfq1', 'RFQ-001', 'biz1', 'u1', 'Need 100kg rice', 'desc', 'open', 'LKR', 1, ${now - 1000}, ${now - 1000}, ${now - 1000}),
        ('rfq2', 'RFQ-002', 'biz1', 'u1', 'Need 200kg rice', 'desc', 'open', 'LKR', 1, ${now - 500},  ${now - 500},  ${now - 500}),
        ('rfq3', 'RFQ-003', 'biz1', 'u1', 'Need snacks',    'desc', 'open', 'LKR', 1, ${now - 400},  ${now - 400},  ${now - 400}),
        ('rfq4', 'RFQ-004', 'biz1', 'u1', 'Old rfq',        'desc', 'draft', 'LKR', 0, ${now - 1000}, ${now - 1000}, ${now - 1000});
    INSERT INTO rfq_items (id, rfq_id, product_id, description, quantity, unit, created_at)
      VALUES
        ('ri1', 'rfq1', 'p1', 'rice', 100, 'kg', ${now - 1000}),
        ('ri2', 'rfq2', 'p1', 'rice', 200, 'kg', ${now - 500}),
        ('ri3', 'rfq3', 'p2', 'biscuits', 50, 'pack', ${now - 400});
  `);
});

describe('BuyLeads daily digest integration', () => {
  it('emails supA with 2 matched RFQs (skipping supB opted-out, rfq4 draft)', async () => {
    queueSend.mockClear();
    const result = await runBuyLeadsDigest(env);
    expect(result.suppliersEmailed).toBe(1);
    expect(result.rfqsSent).toBe(2);
    expect(queueSend).toHaveBeenCalledTimes(1);
    const payload = queueSend.mock.calls[0][0];
    expect(payload.kind).toBe('buyleads_digest');
    expect(payload.recipientEmail).toBe('owner@a.lk');
    expect(payload.subject).toMatch(/2 new RFQs/);
    expect(payload.body).toContain('RFQ-001');
    expect(payload.body).toContain('RFQ-002');
    expect(payload.body).not.toContain('RFQ-003');
    expect(payload.body).not.toContain('RFQ-004');
    expect(payload.link).toBe('/supplier/buyleads');
  });
});
