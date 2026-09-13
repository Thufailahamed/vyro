/**
 * Cross-border E2E (focused): sanctions, KYC gate, FX, wire reconciliation.
 * Drives real routers + real drizzle + sqlite-backed D1 shim.
 */
import { describe, expect, it, vi, beforeAll } from 'vitest';

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

const kv = new Map<string, string>();
const env: any = {
  DB: null,
  CROSS_BORDER_ENABLED: 'true',
  CROSS_BORDER_KV: {
    get: async (k: string) => kv.get(k) ?? null,
    put: async (k: string, v: string) => { kv.set(k, v); },
  },
  CROSS_BORDER_DOCS: { put: async () => ({ key: 'k' }) },
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  METRICS: undefined,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
};

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

  kv.set('sanctions:list', JSON.stringify(['RU', 'IR', 'KP', 'SY', 'CU']));
  kv.set('fx:LKR:USD:rateScaled', '330000');
  kv.set('fx:LKR:USD:fetchedAt', String(Date.now()));

  // Stub CBSL exchangerate API: returns 330 LKR per USD for LKR→USD,
  // 1/330 USD per LKR for USD→LKR.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    let rate = 1;
    if (u.includes('base=USD') && u.includes('quote=LKR')) rate = 330;
    else if (u.includes('base=LKR') && u.includes('quote=USD')) rate = 1 / 330;
    else if (u.includes('base=USD') && u.includes('quote=GBP')) rate = 0.79;
    return new Response(JSON.stringify({ rates: { LKR: rate, USD: rate, GBP: rate } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  // Restore on module unload.
  process.on('beforeExit', () => { globalThis.fetch = realFetch; });

  // Seed a minimal PO + snapshot for wire reconciliation tests.
  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();

  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const buyer = newId();
  await db.insert(schema.users).values({
    id: buyer, email: 'buyer@e2e.test', passwordHash: 'x', name: 'Buyer', phone: '077',
    avatarUrl: null, adminRole: null, adminInvitedAt: null, adminInvitedBy: null,
    status: 'active', marketingOptIn: false, require2fa: false,
    createdAt: now, updatedAt: now, deletedAt: null,
  });
  const finance = newId();
  await db.insert(schema.users).values({
    id: finance, email: 'finance@e2e.test', passwordHash: 'x', name: 'Finance', phone: '077',
    avatarUrl: null, adminRole: 'finance', adminInvitedAt: now, adminInvitedBy: null,
    status: 'active', marketingOptIn: false, require2fa: false,
    createdAt: now, updatedAt: now, deletedAt: null,
  });
  const biz = newId();
  await db.insert(schema.businesses).values({
    id: biz, name: 'US Foods', businessTypeId: bt, contactPerson: 'B', phone: '077',
    email: 'us@e2e.test', address: '1 Main', city: 'NY', district: 'NY',
    description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
    countryCode: 'US', taxId: 'TX-US', kycLevel: 'basic',
    kycVerifiedAt: now, kycVerifiedBy: 'finance',
  });
  const sup = newId();
  await db.insert(schema.suppliers).values({
    id: sup, name: 'LK Mills', businessTypeId: bt, contactPerson: 'S', phone: '077',
    email: 's@e2e.test', address: '2 Mill', city: 'Colombo', district: 'Colombo',
    description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
    countryCode: 'LK', isExportEligible: true,
  });

  // Create an FX snapshot row
  const snap = newId();
  await db.insert(schema.fxSnapshots).values({
    id: snap,
    base: 'LKR',
    quoteCurrency: 'USD',
    rateScaled: '330000',
    provider: 'CBSL',
    fetchedAt: now,
  });

  // Create a pending cross-border PO (direction=export, status=pending)
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({
    id: poId,
    poNumber: `PO-E2E-${poId.slice(-8).toUpperCase()}`,
    businessId: biz,
    supplierId: sup,
    status: 'pending',
    subtotalCents: 100000,
    deliveryFeeCents: 0,
    totalCents: 100000,
    currency: 'LKR',
    deliveryAddress: '1 Main',
    deliveryCity: 'NY',
    deliveryDistrict: 'NY',
    createdByUserId: buyer,
    direction: 'export',
    fxSnapshotId: snap,
    incoterms: 'FOB',
    createdAt: now,
    updatedAt: now,
  } as never);

  // Persist ids for retrieval in tests.
  (globalThis as any).__poId = poId;
  (globalThis as any).__financeId = finance;
}, 60000);

describe('Cross-border E2E: sanctions check', () => {
  it('isCountrySanctioned returns true for blocked country', async () => {
    const { isCountrySanctioned } = await import('../../src/modules/cross-border/sanctions');
    expect(await isCountrySanctioned('RU', env)).toBe(true);
    expect(await isCountrySanctioned('US', env)).toBe(false);
  });
});

describe('Cross-border E2E: pre-order direction', () => {
  it('returns direction=export with fx snapshot for LK supplier + US buyer', async () => {
    const { preOrderCreateCheck } = await import('../../src/modules/cross-border/service');
    const { getDb } = await import('@vyro/db');
    const r = await preOrderCreateCheck({
      buyerCountry: 'US',
      supplierCountry: 'LK',
      hsCodes: [],
      env,
      db: getDb(env.DB),
    });
    expect(r.direction).toBe('export');
    expect(r.fxSnapshotId).toBeTruthy();
  });

  it('returns direction=domestic and skips FX for LK + LK', async () => {
    const { preOrderCreateCheck } = await import('../../src/modules/cross-border/service');
    const { getDb } = await import('@vyro/db');
    const r = await preOrderCreateCheck({
      buyerCountry: 'LK',
      supplierCountry: 'LK',
      hsCodes: [],
      env,
      db: getDb(env.DB),
    });
    expect(r.direction).toBe('domestic');
    expect(r.fxSnapshotId).toBeNull();
  });

  it('throws COUNTRY_SANCTIONED when buyer is sanctioned', async () => {
    const { preOrderCreateCheck } = await import('../../src/modules/cross-border/service');
    const { getDb } = await import('@vyro/db');
    try {
      await preOrderCreateCheck({ buyerCountry: 'RU', supplierCountry: 'LK', hsCodes: [], env, db: getDb(env.DB) });
      expect.fail('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('COUNTRY_SANCTIONED');
    }
  });
});

describe('Cross-border E2E: restricted goods', () => {
  it('blocks weapons (HS 9301)', async () => {
    const { isProductRestricted } = await import('../../src/modules/cross-border/restricted');
    const r = await isProductRestricted('9301.00', 'US', env);
    expect(r.restricted).toBe(true);
  });

  it('allows staples (HS 1006)', async () => {
    const { isProductRestricted } = await import('../../src/modules/cross-border/restricted');
    const r = await isProductRestricted('1006.30', 'US', env);
    expect(r.restricted).toBe(false);
  });
});

describe('Cross-border E2E: wire reconciliation', () => {
  it('rejects >1% delta without acknowledgement', async () => {
    const { handleWireReceived } = await import('../../src/modules/admin/wireRecon');
    const poId = (globalThis as any).__poId;
    const finance = (globalThis as any).__financeId;
    try {
      await handleWireReceived(env, {
        orderId: poId,
        wireRef: 'TEST-1',
        receivedAmountCents: 20000, // 200 USD @ 330 → 66000 LKR vs 100000 expected
        receivedCurrency: 'USD',
        adminUserId: finance,
      });
      expect.fail('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('WIRE_RECONCILIATION_MISMATCH');
    }
  });

  it('accepts >1% delta with acknowledgement', async () => {
    const { handleWireReceived } = await import('../../src/modules/admin/wireRecon');
    const poId = (globalThis as any).__poId;
    const finance = (globalThis as any).__financeId;
    const r = await handleWireReceived(env, {
      orderId: poId,
      wireRef: 'TEST-2',
      receivedAmountCents: 20000,
      receivedCurrency: 'USD',
      acknowledgeMismatch: true,
      adminUserId: finance,
    });
    expect(r.status).toBe('paid');
  });
});

describe('Cross-border E2E: FX rates HTTP endpoint', () => {
  it('returns 200 with LKR base rates via the public router', async () => {
    const fxRouter = (await import('../../src/routes/fx')).default;
    const { Hono } = await import('hono');
    const { errorEnvelope } = await import('../../src/lib/errors');
    const app = new Hono<{ Bindings: any }>();
    app.onError((err, c) => {
      const e = errorEnvelope(err);
      return c.json(e.body, e.status as any);
    });
    app.route('/api', fxRouter);
    const res = await app.fetch(new Request('http://localhost/api/fx/rates?base=LKR&quote=USD'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.rateScaled).toBeTruthy();
  });
});
