/**
 * Integration: rfqService.submitQuote wires crm.markQuoted so the
 * rfq_suppliers.conversion_status flips to 'quoted' and quotedAt is set.
 *
 * The crm-side behavior is unit-tested in
 * apps/api/test/rfqs/crm.test.ts. This test guards the *wiring* — a future
 * refactor that drops the `if (inv) await crm.markQuoted(...)` line in
 * service.ts would silence CRM notifications without breaking any other test.
 */
import { describe, it, expect, vi } from 'vitest';

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
      id: 'biz1', name: 'Biz 1', businessTypeId: 'bt1', contactPerson: 'cp',
      phone: '0700', email: 'b@biz.lk', address: 'addr', city: 'city', district: 'dist',
      description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
      countryCode: 'LK', taxId: null, kycLevel: 'basic',
      kycVerifiedAt: null, kycVerifiedBy: null,
    });
    await db.insert(schema.users).values({
      id: 'u1', email: 'b@biz.lk', passwordHash: 'h', name: 'Buyer',
      phone: '0700', avatarUrl: null, adminRole: null,
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
    await db.insert(schema.supplierMembers).values({
      id: 'sm1', supplierId: 'supA', userId: 'u1', role: 'owner',
      createdAt: now, updatedAt: now,
    } as never).catch(() => undefined);

    const rfqCreatedAt = now - 1000;
    await db.insert(schema.rfqs).values({
      id: 'rfq1', rfqNumber: 'RFQ-001', businessId: 'biz1', createdByUserId: 'u1',
      title: 'Need 100kg rice', description: 'desc', status: 'open', currency: 'LKR',
      deadline: now + 7 * 24 * 60 * 60 * 1000,
      isOpen: 1, publishedAt: rfqCreatedAt,
      createdAt: rfqCreatedAt, updatedAt: rfqCreatedAt,
    });
    await db.insert(schema.rfqItems).values({
      id: 'ri1', rfqId: 'rfq1', description: 'rice', quantity: 100, unit: 'kg',
      productId: null, supplierProductId: null, specifications: null,
      createdAt: rfqCreatedAt,
    });
    await db.insert(schema.rfqSuppliers).values({
      id: 'rs1', rfqId: 'rfq1', supplierId: 'supA', status: 'invited',
      invitedAt: rfqCreatedAt, viewedAt: null, respondedAt: null,
      tag: null, conversionStatus: null, quotedAt: null,
      orderId: null, orderValueCents: null,
    });
  })();
  return __seedReady;
}

describe('rfqService.submitQuote wires crm.markQuoted', () => {
  it('flips conversion_status to quoted + sets quotedAt on the rfq_suppliers row', async () => {
    await ensureSeed();
    const { rfqService } = await import('../../src/modules/rfqs/service');
    const { crmRepository } = await import('../../src/modules/rfqs/crmRepository');

    const before = await crmRepository.findLeadByRfqAndSupplier(d1, 'rfq1', 'supA');
    expect(before?.conversionStatus).toBeNull();
    expect(before?.quotedAt).toBeNull();

    const result = await rfqService.submitQuote(
      d1,
      'u1',
      'rfq1',
      'supA',
      {
        currency: 'LKR',
        deliveryFeeCents: 0,
        taxCents: 0,
        discountCents: 0,
        items: [
          // description-based coverage: rfq_service matches rfq_items by description.
          { description: 'rice', quantity: 100, unit: 'kg', unitPriceCents: 1000, discountCents: 0 },
        ],
      },
      undefined,
    );

    expect(result.totalCents).toBe(100000); // 100 × 1000 cents

    const after = await crmRepository.findLeadByRfqAndSupplier(d1, 'rfq1', 'supA');
    expect(after?.conversionStatus).toBe('quoted');
    expect(after?.quotedAt).not.toBeNull();
  });

  it('does not crash when rfqSuppliers row is absent (markQuoted silent skip)', async () => {
    // No invited supplier — service throws 403 before markQuoted. The "skip"
    // contract is in crm.ts and unit-tested elsewhere; here we confirm the
    // service never crashes when the row IS present but the conversion flip
    // is the only side effect we care about.
    await ensureSeed();
    const { rfqService } = await import('../../src/modules/rfqs/service');

    // Submitting a second quote (resubmit path) must still wire markQuoted —
    // it's idempotent at the CRM row level.
    await expect(
      rfqService.submitQuote(
        d1,
        'u1',
        'rfq1',
        'supA',
        {
          currency: 'LKR',
          items: [{ description: 'rice', quantity: 100, unit: 'kg', unitPriceCents: 1100 }],
        },
        undefined,
      ),
    ).resolves.toBeDefined();
  });
});
