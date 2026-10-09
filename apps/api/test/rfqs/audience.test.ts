import { describe, it, expect, vi } from 'vitest';
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

const sqlite: DatabaseSync = new nodeSqlite.DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON;');
const d1: D1Database = makeD1(sqlite);
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


// Capture supplier notifications instead of writing them.
const sent = vi.hoisted(() => ({ calls: [] as Array<{ supplierId: string; type: string; title: string }> }));
vi.mock('../../src/modules/notifications/dispatcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/notifications/dispatcher')>();
  return {
    ...actual,
    listSupplierMemberIds: async (_d1: unknown, supplierId: string) => [`member-of:${supplierId}`],
    listBusinessMemberIds: async () => [],
    notifyUsers: async (_d1: unknown, _q: unknown, userIds: string[], n: { type: string; title: string }) => {
      for (const u of userIds) sent.calls.push({ supplierId: u.replace('member-of:', ''), type: n.type, title: n.title });
    },
  };
});

let seeded: Promise<void> | null = null;
function seed(): Promise<void> {
  seeded ??= (async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(d1);
    const now = Date.now();
    await db.insert(schema.businessTypes).values({ id: 'bt1', slug: 'wholesale', name: 'Wholesale', active: 1 } as never);
    await db.insert(schema.businesses).values({ id: 'biz1', name: 'Buyer', businessTypeId: 'bt1', contactPerson: 'cp', phone: '0700', email: 'b@biz.lk', address: 'a', city: 'Colombo', district: 'Colombo', status: 'active', createdAt: now, updatedAt: now } as never);
    await db.insert(schema.users).values({ id: 'u1', email: 'b@biz.lk', passwordHash: 'h', name: 'Buyer', phone: '0700', status: 'active', createdAt: now, updatedAt: now } as never);
    const sup = (id: string, name: string, extra: Record<string, unknown> = {}) =>
      db.insert(schema.suppliers).values({ id, name, businessTypeId: 'bt1', contactPerson: 'cp', phone: '0700', email: `${id}@s.lk`, address: 'a', city: 'Kandy', district: 'Kandy', status: 'active', createdAt: now, updatedAt: now, countryCode: 'LK', ...extra } as never);
    await sup('supRice', 'Alpha Rice Mills', { verificationStatus: 'verified' });
    await sup('supBeta', 'Beta Traders');
    await sup('supGone', 'Gamma Suspended', { status: 'suspended' });
    await db.insert(schema.categories).values({ id: 'cat1', slug: 'staples', name: 'Staples' } as never);
    await db.insert(schema.products).values({ id: 'pRice', name: 'Rice', categoryId: 'cat1', unit: 'kg', createdAt: now, updatedAt: now } as never);
    await db.insert(schema.supplierProducts).values({ id: 'spRice', supplierId: 'supRice', productId: 'pRice', priceCents: 100, minOrderQty: 1, stockQty: 10, leadTimeDays: 1, createdAt: now, updatedAt: now } as never);
  })();
  return seeded;
}

const baseRfq = {
  businessId: 'biz1',
  title: 'Monthly rice',
  currency: 'LKR',
  fromCart: false,
  items: [{ productId: 'pRice', description: 'Rice', quantity: 100, unit: 'kg' }],
};

describe('RFQ audience: one, some or all suppliers', () => {
  it('supplier search ranks sellers of the requested products first and hides suspended suppliers', async () => {
    await seed();
    const { rfqService } = await import('../../src/modules/rfqs/service');
    const all = await rfqService.searchSuppliers(d1, { productIds: ['pRice'] });
    expect(all.map((r) => r.supplier.id)).toEqual(['supRice', 'supBeta']);
    expect(all[0]).toMatchObject({ productCount: 1, coverage: 1, supplier: { verified: true } });
    expect((await rfqService.searchSuppliers(d1, { q: 'beta' })).map((r) => r.supplier.id)).toEqual(['supBeta']);
  });

  it('selected suppliers: only the invited ones hear about it, and only once published', async () => {
    await seed();
    const { rfqService } = await import('../../src/modules/rfqs/service');
    sent.calls = [];
    const { id } = await rfqService.create(d1, 'u1', { ...baseRfq, isOpen: false, supplierIds: ['supBeta'] } as never);
    expect(sent.calls).toHaveLength(0); // draft: nobody notified yet
    await rfqService.publish(d1, 'u1', id, 'business');
    expect(sent.calls.map((c) => c.supplierId)).toEqual(['supBeta']);
    expect(sent.calls[0]!.type).toBe('rfq.invited');
  });

  it('all suppliers: publishing an open RFQ notifies every active supplier', async () => {
    await seed();
    const { rfqService } = await import('../../src/modules/rfqs/service');
    sent.calls = [];
    const { id } = await rfqService.create(d1, 'u1', { ...baseRfq, isOpen: true, supplierIds: [] } as never);
    await rfqService.publish(d1, 'u1', id, 'business');
    expect(sent.calls.map((c) => c.supplierId).sort()).toEqual(['supBeta', 'supRice']);
    expect(sent.calls.every((c) => c.type === 'rfq.opened')).toBe(true);
  });
});
