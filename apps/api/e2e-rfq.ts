/**
 * Real-DB end-to-end test for the RFQ workflow (run manually, not in CI).
 * Uses Node's built-in SQLite behind a minimal D1-compatible shim so the
 * REAL rfqService code + REAL drizzle schema run against a REAL database:
 *   create -> publish -> 3 quotes (full / cheaper / partial+alternative+tiers)
 *   -> compare -> counter -> accept -> award -> convert to PO -> verify lock
 * Run: node_modules/.bin/tsx e2e-rfq.ts   (from apps/api)
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Minimal D1Database-compatible shim over node:sqlite. */
function makeD1(sqlite: DatabaseSync): D1Database {
  const wrap = (sql: string, bound: unknown[] = []): D1PreparedStatement => {
    const st = {
      bind(...params: unknown[]) { return wrap(sql, [...bound, ...params]); },
      first: async (col?: string) => {
        const prep = sqlite.prepare(sql);
        const row = prep.get(...bound) as Record<string, unknown> | undefined;
        if (!row) return null;
        return col ? (row[col] ?? null) : row;
      },
      all: async () => {
        const prep = sqlite.prepare(sql);
        const results = prep.all(...bound) as Record<string, unknown>[];
        return { results, success: true, meta: {} };
      },
      run: async () => {
        const prep = sqlite.prepare(sql);
        const r = prep.run(...bound) as unknown as { changes: unknown; lastInsertRowid: unknown };
        return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
      },
      raw: async () => {
        const prep = sqlite.prepare(sql);
        const rows = prep.all(...bound) as Record<string, unknown>[];
        return rows.map((r) => Object.values(r));
      },
    };
    return st as unknown as D1PreparedStatement;
  };
  return {
    prepare: (sql: string) => wrap(sql),
    exec: async (sql: string) => { sqlite.exec(sql); },
    batch: async (stmts: D1PreparedStatement[]) => {
      const out = [];
      for (const s of stmts) out.push(await (s as unknown as { run(): Promise<unknown> }).run());
      return out as never;
    },
  } as unknown as D1Database;
}

async function main() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const d1 = makeD1(sqlite);

  const migDir = join(root, 'packages/db/migrations');
  const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(migDir, f), 'utf8');
    try {
      sqlite.exec(sql.split('--> statement-breakpoint').join(';'));
    } catch (e) {
      throw new Error(`migration ${f}: ${(e as Error).message}`);
    }
  }
  console.log(`migrations applied: ${files.length} files`);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const { rfqService } = await import('./src/modules/rfqs/service');
  const db = getDb(d1);
  const now = Date.now();
  const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); console.log(`  ok: ${msg}`); };

  const mkUser = async (email: string) => {
    const id = newId();
    await db.insert(schema.users).values({ id, email, passwordHash: 'x', name: email, phone: null, avatarUrl: null, isPlatformAdmin: false, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
    return id;
  };
  const buyer = await mkUser('buyer@e2e.test');
  const s1u = await mkUser('s1@e2e.test');
  const s2u = await mkUser('s2@e2e.test');
  const s3u = await mkUser('s3@e2e.test');
  const btId = newId();
  await db.insert(schema.businessTypes).values({ id: btId, slug: 'restaurant', name: 'Restaurant', active: true });
  const bizId = newId();
  await db.insert(schema.businesses).values({ id: bizId, name: 'E2E Foods', businessTypeId: btId, contactPerson: 'B', phone: '077', email: 'b@e2e.test', address: '1 Main', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: bizId, userId: buyer, role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const mkSup = async (name: string, userId: string) => {
    const id = newId();
    await db.insert(schema.suppliers).values({ id, name, businessTypeId: btId, contactPerson: 'S', phone: '077', email: `${id}@e2e.test`, address: '2 Mill', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
    await db.insert(schema.supplierMembers).values({ id: newId(), supplierId: id, userId, role: 'owner', status: 'active', createdAt: now, updatedAt: now });
    return id;
  };
  const supA = await mkSup('Mill A', s1u);
  const supB = await mkSup('Mill B', s2u);
  const supC = await mkSup('Mill C', s3u);
  const catId = newId();
  await db.insert(schema.categories).values({ id: catId, slug: 'staples', name: 'Staples', parentId: null, sortOrder: 1, active: true });
  const mkProd = async (name: string) => {
    const id = newId();
    await db.insert(schema.products).values({ id, name, description: name, categoryId: catId, brand: null, unit: 'kg', packSize: null, active: true, createdAt: now, updatedAt: now, deletedAt: null } as never);
    return id;
  };
  const rice = await mkProd('Samba Rice 25kg');
  const flour = await mkProd('Wheat Flour 25kg');
  const oil = await mkProd('Cooking Oil 10L');
  console.log('seed done');

  // 1. Create + publish
  const { id: rfqId, rfqNumber } = await rfqService.create(d1, buyer, {
    businessId: bizId, title: 'E2E bulk staples', currency: 'LKR',
    deadline: now + 7 * 86400000, deliveryLocation: '1 Main, Colombo',
    items: [
      { description: 'Samba Rice', productId: rice, quantity: 1000, unit: 'kg', targetPriceCents: 40000 },
      { description: 'Wheat Flour', productId: flour, quantity: 500, unit: 'kg' },
      { description: 'Cooking Oil', productId: oil, quantity: 100, unit: 'L' },
    ],
    supplierIds: [supA, supB, supC], isOpen: false, fromCart: false,
  } as never);
  assert(rfqNumber.startsWith('RFQ-'), `RFQ created ${rfqNumber}`);
  await rfqService.publish(d1, buyer, rfqId, 'business');
  console.log('  ok: published');

  // 2. Quotes: A full (expensive), B full (cheap), C partial + alternative + tiers
  const qA = await rfqService.submitQuote(d1, s1u, rfqId, supA, {
    deliveryFeeCents: 500000, taxCents: 0, discountCents: 0, validUntil: now + 14 * 86400000,
    paymentTerms: 'Net 14', notes: 'Mill A standard',
    items: [
      { description: 'Samba Rice', quantity: 1000, unitPriceCents: 42000 },
      { description: 'Wheat Flour', quantity: 500, unitPriceCents: 18000 },
      { description: 'Cooking Oil', quantity: 100, unitPriceCents: 55000 },
    ],
  } as never);
  const allItems = await db.select().from(schema.rfqItems).all();
  const mine = allItems.filter((i) => (i as unknown as { rfqId: string }).rfqId === rfqId);
  const byDesc = new Map(mine.map((i) => [(i as unknown as { description: string }).description, (i as unknown as { id: string }).id]));
  const qB = await rfqService.submitQuote(d1, s2u, rfqId, supB, {
    deliveryFeeCents: 300000, taxCents: 0, discountCents: 200000, validUntil: now + 14 * 86400000,
    items: [
      { description: 'Samba Rice', rfqItemId: byDesc.get('Samba Rice'), quantity: 1000, unitPriceCents: 39500 },
      { description: 'Wheat Flour', rfqItemId: byDesc.get('Wheat Flour'), quantity: 500, unitPriceCents: 17500 },
      { description: 'Cooking Oil', rfqItemId: byDesc.get('Cooking Oil'), quantity: 100, unitPriceCents: 54000 },
    ],
  } as never);
  const qC = await rfqService.submitQuote(d1, s3u, rfqId, supC, {
    deliveryFeeCents: 200000, validUntil: now + 14 * 86400000,
    items: [
      { description: 'Samba Rice', rfqItemId: byDesc.get('Samba Rice'), quantity: 1000, unitPriceCents: 39000, tiers: [{ minQty: 1000, unitPriceCents: 39000 }, { minQty: 2000, unitPriceCents: 37000 }] },
      { description: 'Alt flour blend', quantity: 500, unitPriceCents: 15000, isAlternative: true, alternativeForRfqItemId: byDesc.get('Wheat Flour') },
    ],
  } as never);
  assert(!qA.isPartial && !qB.isPartial && qC.isPartial, 'partial quote flagged (C), full quotes complete');
  console.log(`  ok: quotes A=${qA.totalCents} B=${qB.totalCents} C=${qC.totalCents}(partial)`);

  // 3. Compare on landed cost: best complete = B (never partial C)
  const cmp = await rfqService.compare(d1, rfqId);
  assert(cmp.bestPriceQuoteId === qB.id, 'best price is supplier B');
  assert((cmp.splitOptimization as { supplierCount: number }).supplierCount >= 1, 'split optimization computed');

  // 4. Negotiate with B
  await rfqService.counter(d1, buyer, qB.id, 'business', { proposedTotalCents: qB.totalCents - 500000, message: 'Can you do a bit better for 1000kg+?' });
  const counters = await db.select().from(schema.quoteCounterOffers).all();
  assert(counters.length === 1, 'counter stored as history (no overwrite)');
  await rfqService.respondCounter(d1, s2u, (counters[0] as unknown as { id: string }).id, true);
  const bAfter = await db.select().from(schema.supplierQuotes).where(eq(schema.supplierQuotes.id, qB.id)).get() as unknown as { totalCents: number; version: number };
  assert(bAfter.totalCents === qB.totalCents - 500000, 'counter acceptance repriced quote');
  assert(bAfter.version === 2, 'quote version bumped');
  const versions = await db.select().from(schema.quoteVersions).all();
  assert(versions.length >= 4, `version history kept (${versions.length} rows)`);

  // 5. Expired quote cannot be awarded
  await db.update(schema.supplierQuotes).set({ validUntil: now - 1000 }).where(eq(schema.supplierQuotes.id, qA.id));
  let expiredBlocked = false;
  try { await rfqService.award(d1, buyer, rfqId, qA.id, []); } catch { expiredBlocked = true; }
  assert(expiredBlocked, 'expired quote award blocked');
  await db.update(schema.supplierQuotes).set({ validUntil: now + 14 * 86400000 }).where(eq(schema.supplierQuotes.id, qA.id));

  // 6. Award B; concurrent second award must fail
  await rfqService.award(d1, buyer, rfqId, qB.id, []);
  let doubleBlocked = false;
  try { await rfqService.award(d1, buyer, rfqId, qA.id, []); } catch { doubleBlocked = true; }
  assert(doubleBlocked, 'second award blocked (concurrency guard)');
  const losers = (await db.select().from(schema.supplierQuotes).all()).filter((r) => (r as unknown as { rfqId: string }).rfqId === rfqId && (r as unknown as { id: string }).id !== qB.id);
  assert(losers.every((l) => (l as unknown as { status: string }).status === 'rejected'), 'losing quotes rejected');

  // 7. Convert to PO: locked prices + linkage, no duplicate PO
  const { poId, poNumber } = await rfqService.convertToOrder(d1, buyer, rfqId);
  const po = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId)).get() as unknown as { totalCents: number; rfqId: string; quoteId: string; status: string };
  assert(po.status === 'pending' && po.rfqId === rfqId && po.quoteId === qB.id, `PO ${poNumber} linked to RFQ+quote`);
  assert(po.totalCents === bAfter.totalCents, 'PO total = agreed quote total (price lock)');
  const poItems = (await db.select().from(schema.purchaseOrderItems).all()).filter((r) => (r as unknown as { purchaseOrderId: string }).purchaseOrderId === poId);
  assert(poItems.length === 3, 'PO carries all agreed lines');
  assert(poItems.every((i) => (i as unknown as { unitPriceCentsSnapshot: number }).unitPriceCentsSnapshot === (i as unknown as { unitPriceCents: number }).unitPriceCents), 'PO prices snapshotted (locked)');
  let dupBlocked = false;
  try { await rfqService.convertToOrder(d1, buyer, rfqId); } catch { dupBlocked = true; }
  assert(dupBlocked, 'duplicate PO from same quote blocked');

  // 8. Expiry sweep is quiet when nothing is due
  const sweep = await rfqService.expireDue(d1);
  assert(sweep.rfqsExpired === 0, 'no spurious expiry');

  // 9. Audit trail completeness
  const events = (await db.select().from(schema.rfqEvents).all()).filter((r) => (r as unknown as { rfqId: string }).rfqId === rfqId);
  const actions = new Set(events.map((e) => (e as unknown as { action: string }).action));
  for (const a of ['RFQ_CREATED', 'RFQ_OPENED', 'SUPPLIER_INVITED', 'QUOTE_CREATED', 'QUOTE_SUBMITTED', 'COUNTER_OFFER_CREATED', 'COUNTER_OFFER_ACCEPTED', 'RFQ_AWARDED', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'ORDER_CREATED_FROM_QUOTE']) {
    assert(actions.has(a), `audit has ${a}`);
  }
  console.log(`\nE2E PASS: ${rfqNumber} -> 3 quotes (1 partial) -> negotiated -> awarded -> PO ${poNumber}`);
}

main().catch((e) => { console.error('E2E FAIL:', e); process.exit(1); });
