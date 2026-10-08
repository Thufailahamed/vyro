import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../../helpers/d1';

let app: Hono;
let sessionCtx: any = null;

vi.mock('../../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

vi.mock('../../../src/lib/featureFlags', () => ({
  isFeatureEnabled: async () => false,
}));

const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  UPLOADS_QUEUE: undefined,
  ENVIRONMENT: 'test',
  PRODUCTS: null,
};
const b64 = (s: string) => Buffer.from(s).toString('base64');

async function post(path: string, body?: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    env,
  );
}

let seeded: { biz: string; sup: string; userId: string };
let catId: string;

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  env.PRODUCTS = {
    put: async () => null,
    get: async () => null,
  };

  const { errorEnvelope } = await import('../../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  const router = (await import('../../../src/modules/ai/productUpload/routes')).default;
  app.route('/api/ai/product-uploads', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  const userId = 'u-sup';
  await db.insert(schema.users).values({ id: userId, email: 'sup@t', passwordHash: 'x', name: 'S', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz,  name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null } as any);
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 'su@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.supplierMembers).values({ id: newId(), supplierId: sup, userId: 'u-sup', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  catId = newId();
  await db.insert(schema.categories).values({ id: catId, name: 'Groceries', slug: `groceries-${catId}`, parentId: null, active: true });
  // Existing catalog product, active, for the product-matched row.
  await db.insert(schema.products).values({ id: 'p-rice', name: 'Rice 5kg', description: null, categoryId: catId, brand: null, unit: 'bag', packSize: null, active: true, featured: false, moderationNotes: null, createdAt: now, updatedAt: now, deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false });
  seeded = { biz, sup, userId };
}, 60000);

const supplierCtx = () => ({ userId: 'u-sup', isAdmin: false, adminRole: null, businesses: [], suppliers: [{ supplierId: seeded.sup, role: 'owner' }] });

async function seedExtractedSession(rows: Array<Record<string, unknown>>): Promise<string> {
  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(env.DB);
  const now = Date.now();
  const sid = newId();
  await db.insert(schema.productUploadSessions).values({
    id: sid, supplierId: seeded.sup, userId: seeded.userId,
    status: 'extracted', sourceKind: 'csv', r2Key: `product-uploads/${seeded.biz}/${sid}.csv`,
    originalFilename: 'l.csv', mimeType: 'text/csv', sizeBytes: 100,
    errorMessage: null, createdAt: now, updatedAt: now, committedAt: null,
  });
  for (let i = 0; i < rows.length; i++) {
    await db.insert(schema.productUploadRows).values({
      id: newId(), sessionId: sid, rowIndex: i, rawJson: '{}',
      productName: String(rows[i]!.productName ?? ''),
      unit: (rows[i]!.unit as string | null) ?? null,
      priceLkr: (rows[i]!.priceLkr as number | null) ?? null,
      minOrderQty: (rows[i]!.minOrderQty as number | null) ?? null,
      confidence: 90,
      matchType: (rows[i]!.matchType as string) ?? 'proposal',
      matchProductId: (rows[i]!.matchProductId as string | null) ?? null,
      matchScore: 90,
      decision: (rows[i]!.decision as string) ?? 'accepted',
      createdAt: now, updatedAt: now,
    } as any);
  }
  return sid;
}

describe('POST /api/ai/product-uploads/:id/commit', () => {
  it('creates proposals then commits accepted rows via the import pipeline', async () => {
    sessionCtx = supplierCtx();
    const sid = await seedExtractedSession([
      // product-matched: has a live catalog target
      { productName: 'Rice 5kg', unit: 'bag', priceLkr: 420, minOrderQty: 5, matchType: 'product', matchProductId: 'p-rice', decision: 'accepted' },
      // no match: should become an inactive proposal product, then an offer
      { productName: 'Ampetil 5kg', unit: 'box', priceLkr: 1200, matchType: 'proposal', decision: 'accepted' },
      // no name: skipped entirely
      { productName: '', matchType: 'none', decision: 'rejected' },
    ]);

    const res = await post(`/api/ai/product-uploads/${sid}/commit`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // skipped none-row: import saw 2 rows
    expect(body.results).toHaveLength(2);
    expect(body.proposals).toEqual(['Ampetil 5kg']);

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const session = (await db.select().from(schema.productUploadSessions).where(eq(schema.productUploadSessions.id, sid)).get()) as any;
    expect(session.status).toBe('committed');
    expect(session.committedAt).not.toBeNull();

    const proposalProduct = (await db.select().from(schema.products).where(eq(schema.products.name, 'Ampetil 5kg')).get()) as any;
    // proposal products land blocked for admin approval
    expect(proposalProduct.active).toBe(false);
    expect(proposalProduct.moderationNotes).toContain('AI upload proposal');

    // offer rows created by the import pipeline; proposal offers start inactive
    const offers = await db.select().from(schema.supplierProducts).all();
    expect(offers).toHaveLength(2);
    const riceOffer = offers.find((o) => o.productId === 'p-rice')!;
    expect(riceOffer.priceCents).toBe(42000);
    expect(riceOffer.active).toBe(true);
    const ampOffer = offers.find((o) => o.productId === proposalProduct.id)!;
    expect(ampOffer.priceCents).toBe(120000);
    expect(ampOffer.active).toBe(false);
  });

  it('rejects double commit with 409', async () => {
    sessionCtx = supplierCtx();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const committed = (await db.select().from(schema.productUploadSessions).all()).find((s) => s.status === 'committed')!;
    const res = await post(`/api/ai/product-uploads/${committed.id}/commit`);
    expect(res.status).toBe(409);
  });

  it('keeps the session open when every row fails the dry run', async () => {
    sessionCtx = supplierCtx();
    // Fresh catalog product without an offer: a blank price cell errors
    // ("price_lkr is required for a new listing").
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const pid = newId();
    await db.insert(schema.products).values({ id: pid, name: `Bad Only-${pid}`, description: null, categoryId: catId, brand: null, unit: 'box', packSize: null, active: true, featured: false, moderationNotes: null, createdAt: now, updatedAt: now, deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false });
    const sid = await seedExtractedSession([
      { productName: `Bad Only-${pid}`, matchType: 'product', matchProductId: pid, decision: 'accepted' },
    ]);
    const res = await post(`/api/ai/product-uploads/${sid}/commit`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]!.status).toBe('error');
    const session = (await db.select().from(schema.productUploadSessions).where(eq(schema.productUploadSessions.id, sid)).get()) as any;
    // session stays open for editing
    expect(session.status).toBe('extracted');
  });
});
