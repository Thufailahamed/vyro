import { beforeAll, describe, expect, it } from 'vitest';
import { makeD1, applyMigrations } from '../helpers/d1';

let env: any;
let ids: Record<string, string>;

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env = { DB: d1, ENVIRONMENT: 'test' };

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  const userId = newId();
  await db.insert(schema.users).values({
    id: userId,
    email: 'alias-owner@test.invalid',
    passwordHash: 'test',
    name: 'Alias Owner',
    phone: null,
    avatarUrl: null,
    adminRole: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    emailVerifiedAt: null,
  });
  const businessTypeId = newId();
  await db.insert(schema.businessTypes).values({ id: businessTypeId, slug: `alias-${businessTypeId}`, name: 'Alias Business', active: true });
  const businessId = newId();
  const otherBusinessId = newId();
  await db.insert(schema.businesses).values([
    { id: businessId, name: 'Buyer One', businessTypeId, contactPerson: 'One', phone: '0770000001', email: 'one@test.invalid', address: '1 Road', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null },
    { id: otherBusinessId, name: 'Buyer Two', businessTypeId, contactPerson: 'Two', phone: '0770000002', email: 'two@test.invalid', address: '2 Road', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null },
  ]);
  const supplierId = newId();
  const otherSupplierId = newId();
  await db.insert(schema.suppliers).values([
    { id: supplierId, name: 'Supplier One', businessTypeId, contactPerson: 'One', phone: '0770000011', email: 's1@test.invalid', address: '1 Depot', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null },
    { id: otherSupplierId, name: 'Supplier Two', businessTypeId, contactPerson: 'Two', phone: '0770000012', email: 's2@test.invalid', address: '2 Depot', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null },
  ]);
  const categoryId = newId();
  await db.insert(schema.categories).values({ id: categoryId, slug: `alias-category-${categoryId}`, name: 'Staples', parentId: null, active: true });
  const productId = newId();
  const otherProductId = newId();
  await db.insert(schema.products).values([
    { id: productId, name: 'White Sugar 1kg', description: null, categoryId, brand: null, unit: 'pack', packSize: null, active: true, featured: false, moderationNotes: null, createdAt: now, updatedAt: now, deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false },
    { id: otherProductId, name: 'Raw Sugar 1kg', description: null, categoryId, brand: null, unit: 'pack', packSize: null, active: true, featured: false, moderationNotes: null, createdAt: now, updatedAt: now, deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false },
  ]);
  const sourceUploadId = newId();
  await db.insert(schema.invoiceUploads).values({
    id: sourceUploadId,
    businessId,
    uploadedByUserId: userId,
    status: 'reviewed',
    r2Key: 'alias/source.pdf',
    mimeType: 'application/pdf',
    originalFilename: 'source.pdf',
    sizeBytes: 100,
    createdAt: now,
  } as never);
  ids = { userId, businessId, otherBusinessId, supplierId, otherSupplierId, productId, otherProductId, sourceUploadId };
}, 60000);

describe('invoice product alias repository', () => {
  it('scopes lookup by buyer business and supplier and replaces mappings on explicit correction', async () => {
    const { upsertInvoiceProductAlias, listInvoiceProductAliases } = await import('../../src/modules/documents/repository');

    const first = await upsertInvoiceProductAlias(env, {
      businessId: ids.businessId!,
      supplierId: ids.supplierId!,
      normalizedAlias: 'wht sgr 1kg',
      productId: ids.productId!,
      sourceUploadId: ids.sourceUploadId!,
      createdByUserId: ids.userId!,
    });
    expect(first).toMatchObject({ previousProductId: null, changed: true });

    const repeated = await upsertInvoiceProductAlias(env, {
      businessId: ids.businessId!,
      supplierId: ids.supplierId!,
      normalizedAlias: 'wht sgr 1kg',
      productId: ids.productId!,
      sourceUploadId: ids.sourceUploadId!,
      createdByUserId: ids.userId!,
    });
    expect(repeated).toMatchObject({ id: first.id, previousProductId: ids.productId, changed: false });

    const correction = await upsertInvoiceProductAlias(env, {
      businessId: ids.businessId!,
      supplierId: ids.supplierId!,
      normalizedAlias: 'wht sgr 1kg',
      productId: ids.otherProductId!,
      sourceUploadId: ids.sourceUploadId!,
      createdByUserId: ids.userId!,
    });
    expect(correction).toMatchObject({ id: first.id, previousProductId: ids.productId, changed: true });

    const sameScope = await listInvoiceProductAliases(env, ids.businessId!, ids.supplierId!, ['wht sgr 1kg']);
    expect(sameScope).toEqual([{ normalizedAlias: 'wht sgr 1kg', productId: ids.otherProductId }]);
    expect(await listInvoiceProductAliases(env, ids.otherBusinessId!, ids.supplierId!, ['wht sgr 1kg'])).toEqual([]);
    expect(await listInvoiceProductAliases(env, ids.businessId!, ids.otherSupplierId!, ['wht sgr 1kg'])).toEqual([]);

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const audit = await getDb(env.DB).select().from(schema.auditLogs).all();
    const aliasAudits = audit.filter((entry: any) => entry.action === 'invoice_product_alias.upsert');
    expect(aliasAudits).toHaveLength(2);
    expect(JSON.parse(aliasAudits[1]!.metadata!).previousProductId).toBe(ids.productId);
    expect(JSON.parse(aliasAudits[1]!.metadata!).productId).toBe(ids.otherProductId);
    expect(aliasAudits.every((entry: any) => !entry.metadata.includes('wht sgr 1kg'))).toBe(true);
  });

  it('returns no rows for an empty normalized alias batch', async () => {
    const { listInvoiceProductAliases } = await import('../../src/modules/documents/repository');
    expect(await listInvoiceProductAliases(env, ids.businessId!, ids.supplierId!, ['', ''])).toEqual([]);
  });
});
