import { describe, expect, it, beforeAll } from 'vitest';
import { makeD1, applyMigrations } from '../../helpers/d1';
import type { Env } from '../../../src/env';

let env: any;

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env = { DB: d1, ENVIRONMENT: 'test' };
});

let seeded: { businessId: string; userId: string; supplierId: string };

async function seedPrereqs(withCatalog: boolean): Promise<void> {
  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(env.DB);
  const now = Date.now();
  const userId = newId();
  await db.insert(schema.users).values({ id: userId, email: `${userId}@t`, passwordHash: 'x', name: 's', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: `rest-${newId()}`, name: 'Rest', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, businessId: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '1', email: 'b@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null } as any);
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '1', email: 'su@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  let productId: string | undefined;
  if (withCatalog) {
    const cat = newId();
    await db.insert(schema.categories).values({ id: cat, name: 'Groceries', slug: `groceries-${cat}`, parentId: null, active: true });
    productId = newId();
    await db.insert(schema.products).values({ id: productId, name: 'Rice 5kg', description: null, categoryId: cat, brand: null, unit: 'bag', packSize: null, active: true, featured: false, moderationNotes: null, createdAt: now, updatedAt: now, deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false });
  }
  seeded = { businessId: biz, userId, supplierId: sup };
  void productId;
}

describe('processUploadSession', () => {
  it('extracts csv rows, matches catalog, stages rows', async () => {
    await seedPrereqs(true);
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();

    const sid = newId();
    await db.insert(schema.productUploadSessions).values({
      id: sid, businessId: seeded.businessId, supplierId: seeded.supplierId, userId: seeded.userId,
      status: 'pending', sourceKind: 'csv',
      // test-inline: prefix makes the pipeline read CSV text directly instead of R2
      r2Key: 'test-inline:Item,Rate\nRice 5kg,420',
      originalFilename: 'l.csv', mimeType: 'text/csv', sizeBytes: 100,
      errorMessage: null, createdAt: now, updatedAt: now, committedAt: null,
    });

    const stubEnv: Partial<Env> = {
      ...env,
      AI: {
        run: async () => ({
          response: '{"mapping": {"Item": "product_name", "Rate": "price_lkr"}}',
        }),
      },
      VYRO_AI_UPLOAD_MAP_MODEL: '@cf/test/map',
    } as any;

    const { processUploadSession } = await import('../../../src/modules/ai/productUpload/pipeline');
    await processUploadSession(stubEnv as Env, sid);

    const rows = await db.select().from(schema.productUploadRows).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.productName).toBe('Rice 5kg');
    expect(rows[0]!.priceLkr).toBe(420);
    expect(rows[0]!.matchType).toBe('product');
    expect(rows[0]!.decision).toBe('accepted');
    const session = await db.select().from(schema.productUploadSessions).all();
    expect(session[0]!.status).toBe('extracted');
  });

  it('extracts a zero-row csv as extracted with no rows', async () => {
    await seedPrereqs(false);
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const sid = newId();
    await db.insert(schema.productUploadSessions).values({
      id: sid, businessId: seeded.businessId, supplierId: seeded.supplierId, userId: seeded.userId,
      status: 'pending', sourceKind: 'csv', r2Key: 'test-inline:,bad',
      originalFilename: 'l.csv', mimeType: 'text/csv', sizeBytes: 10,
      errorMessage: null, createdAt: now, updatedAt: now, committedAt: null,
    });
    const boomEnv = { DB: env.DB, ENVIRONMENT: 'test', AI: { run: async () => { throw new Error('boom'); } } } as unknown as Env;
    const { processUploadSession } = await import('../../../src/modules/ai/productUpload/pipeline');
    await processUploadSession(boomEnv, sid);
    const session = await db.select().from(schema.productUploadSessions).all();
    const failed = session.find((s) => s.id === sid);
    // header-only csv → extracted with 0 rows, not failed
    expect(failed!.status).toBe('extracted');
    const rows = await db.select().from(schema.productUploadRows).all();
    expect(rows.find((r) => r.sessionId === sid)).toBeUndefined();
  });

  it('marks the session failed when the R2 object is missing', async () => {
    await seedPrereqs(false);
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const sid = newId();
    await db.insert(schema.productUploadSessions).values({
      id: sid, businessId: seeded.businessId, supplierId: seeded.supplierId, userId: seeded.userId,
      status: 'pending', sourceKind: 'csv', r2Key: 'missing/key',
      originalFilename: 'l.csv', mimeType: 'text/csv', sizeBytes: 10,
      errorMessage: null, createdAt: now, updatedAt: now, committedAt: null,
    });
    const noR2 = { DB: env.DB, ENVIRONMENT: 'test', PRODUCTS: { get: async () => null } } as unknown as Env;
    const { processUploadSession } = await import('../../../src/modules/ai/productUpload/pipeline');
    await processUploadSession(noR2, sid);
    const session = await db.select().from(schema.productUploadSessions).all();
    const failed = session.find((s) => s.id === sid);
    expect(failed!.status).toBe('failed');
    expect(failed!.errorMessage).toContain('R2 object missing');
  });
});
