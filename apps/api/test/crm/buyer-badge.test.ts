/**
 * CRM buyer badge — leads are enriched with the buyer's verification state
 * derived from businesses.kycLevel + kycVerifiedAt via rfqs.businessId.
 */
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

let __seedReady: Promise<void> | null = null;
async function ensureSeed(): Promise<void> {
  if (__seedReady) return __seedReady;
  __seedReady = (async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(d1);
    const now = Date.now();
    await db.insert(schema.businessTypes).values({ id: 'bt1', slug: 'wholesale', name: 'Wholesale', active: 1 });
    await db.insert(schema.businesses).values({
      id: 'bizVerified', name: 'Verified Buyer', businessTypeId: 'bt1', contactPerson: 'cp',
      phone: '0701', email: 'v@biz.lk', address: 'addr', city: 'city', district: 'dist',
      description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
      countryCode: 'LK', taxId: 'TAX-1', kycLevel: 'basic',
      kycVerifiedAt: now, kycVerifiedBy: 'admin1',
    });
    await db.insert(schema.businesses).values({
      id: 'bizPlain', name: 'Plain Buyer', businessTypeId: 'bt1', contactPerson: 'cp',
      phone: '0702', email: 'p@biz.lk', address: 'addr', city: 'city', district: 'dist',
      description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
      countryCode: 'LK', taxId: null, kycLevel: 'none',
      kycVerifiedAt: null, kycVerifiedBy: null,
    });
    await db.insert(schema.users).values({
      id: 'u1', email: 'v@biz.lk', passwordHash: 'h', name: 'Buyer',
      phone: '0701', avatarUrl: null, adminRole: null,
      adminInvitedAt: null, adminInvitedBy: null, status: 'active',
      marketingOptIn: false, require2fa: false,
      createdAt: now, updatedAt: now, deletedAt: null,
    });
    await db.insert(schema.suppliers).values({
      id: 'supA', name: 'Supplier A', businessTypeId: 'bt1', contactPerson: 'cp',
      phone: '0700', email: 'a@a.lk', address: 'addr', city: 'city', district: 'dist',
      description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
      countryCode: 'LK',
    });
    const t = now - 1000;
    await db.insert(schema.rfqs).values({
      id: 'rfqV', rfqNumber: 'RFQ-V', businessId: 'bizVerified', createdByUserId: 'u1',
      title: 'verified need', status: 'open', currency: 'LKR', isOpen: 1,
      publishedAt: t, createdAt: t, updatedAt: t,
    });
    await db.insert(schema.rfqs).values({
      id: 'rfqP', rfqNumber: 'RFQ-P', businessId: 'bizPlain', createdByUserId: 'u1',
      title: 'plain need', status: 'open', currency: 'LKR', isOpen: 1,
      publishedAt: t - 10, createdAt: t - 10, updatedAt: t - 10,
    });
    await db.insert(schema.rfqSuppliers).values({
      id: 'rsV', rfqId: 'rfqV', supplierId: 'supA', status: 'invited',
      invitedAt: t, viewedAt: null, respondedAt: null,
      tag: null, conversionStatus: null, quotedAt: null,
      orderId: null, orderValueCents: null,
    });
    await db.insert(schema.rfqSuppliers).values({
      id: 'rsP', rfqId: 'rfqP', supplierId: 'supA', status: 'invited',
      invitedAt: t - 10, viewedAt: null, respondedAt: null,
      tag: null, conversionStatus: null, quotedAt: null,
      orderId: null, orderValueCents: null,
    });
  })();
  return __seedReady;
}

describe('crm buyer badge enrichment', () => {
  it('marks the verified-buyer lead verified with buyer fields', async () => {
    await ensureSeed();
    const { crmRepository } = await import('../../src/modules/rfqs/crmRepository');
    const { leads } = await crmRepository.listLeadsForSupplier(d1, 'supA', { limit: 25 });
    const verified = leads.find((l) => l.id === 'rsV');
    expect(verified).toBeDefined();
    expect(verified!.buyerBusinessId).toBe('bizVerified');
    expect(verified!.buyerName).toBe('Verified Buyer');
    expect(verified!.buyerKycLevel).toBe('basic');
    expect(verified!.buyerVerified).toBe(true);
    expect(typeof verified!.buyerVerifiedAt).toBe('number');
  });

  it('marks the unverified-buyer lead unverified', async () => {
    await ensureSeed();
    const { crmRepository } = await import('../../src/modules/rfqs/crmRepository');
    const lead = await crmRepository.getLeadForSupplier(d1, 'supA', 'rsP');
    expect(lead).toBeDefined();
    expect(lead!.buyerBusinessId).toBe('bizPlain');
    expect(lead!.buyerKycLevel).toBe('none');
    expect(lead!.buyerVerifiedAt).toBeNull();
    expect(lead!.buyerVerified).toBe(false);
  });
});
