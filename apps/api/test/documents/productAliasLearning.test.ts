import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../helpers/d1';

let sessionCtx: any = null;
const aliasPersistence = vi.hoisted(() => ({ fail: false }));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

vi.mock('../../src/modules/documents/repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/modules/documents/repository')>();
  return {
    ...original,
    upsertInvoiceProductAlias: (...args: Parameters<typeof original.upsertInvoiceProductAlias>) => {
      if (aliasPersistence.fail) throw new Error('test alias store failure');
      return original.upsertInvoiceProductAlias(...args);
    },
  };
});

async function setup() {
  aliasPersistence.fail = false;
  const DB = makeD1();
  await applyMigrations(DB);
  const env: any = {
    DB,
    INVOICES: { put: async () => null, get: async () => null },
    INVOICES_QUEUE: { send: async () => null },
    NOTIFICATIONS_QUEUE: { send: async () => null },
    AUDIT_QUEUE: undefined,
    UPLOADS_QUEUE: undefined,
    METRICS: undefined,
    ENVIRONMENT: 'test',
  };
  const { errorEnvelope } = await import('../../src/lib/errors');
  const app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  const documents = (await import('../../src/modules/documents/routes')).default;
  app.route('/api/documents', documents);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(DB);
  const now = Date.now();
  const userId = newId();
  await db.insert(schema.users).values({
    id: userId,
    email: `${userId}@alias.test`,
    passwordHash: 'test',
    name: 'Alias Buyer',
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
    { id: businessId, name: 'Alias Buyer', businessTypeId, contactPerson: 'Buyer', phone: '0770000001', email: 'buyer@alias.test', address: '1 Road', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null },
    { id: otherBusinessId, name: 'Other Buyer', businessTypeId, contactPerson: 'Other', phone: '0770000002', email: 'other@alias.test', address: '2 Road', city: 'Colombo', district: 'Colombo', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null },
  ]);
  await db.insert(schema.businessMembers).values({ id: newId(), businessId, userId, role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const supplierId = newId();
  await db.insert(schema.suppliers).values({
    id: supplierId,
    name: 'Alias Supplier',
    businessTypeId,
    contactPerson: 'Supplier',
    phone: '0770000003',
    email: 'supplier@alias.test',
    address: '3 Depot',
    city: 'Colombo',
    district: 'Colombo',
    description: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  const categoryId = newId();
  await db.insert(schema.categories).values({ id: categoryId, slug: `alias-category-${categoryId}`, name: 'Staples', parentId: null, active: true });
  const products = [
    { id: newId(), name: 'White Sugar 1kg', unit: 'pack' },
    { id: newId(), name: 'Basmati Rice 5kg', unit: 'bag' },
  ];
  const offers: string[] = [];
  for (const product of products) {
    await db.insert(schema.products).values({
      id: product.id,
      name: product.name,
      description: null,
      categoryId,
      brand: null,
      unit: product.unit,
      packSize: null,
      active: true,
      featured: false,
      moderationNotes: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      hsCode: null,
      countryOfOrigin: null,
      isExportControlled: false,
    });
    const offerId = newId();
    await db.insert(schema.supplierProducts).values({
      id: offerId,
      supplierId,
      productId: product.id,
      priceCents: product.name.startsWith('White') ? 250 : 1200,
      minOrderQty: 1,
      stockQty: 100,
      availabilityStatus: 'in_stock',
      createdAt: now,
      updatedAt: now,
    } as never);
    offers.push(offerId);
  }
  const purchaseOrderId = newId();
  await db.insert(schema.purchaseOrders).values({
    id: purchaseOrderId,
    poNumber: `PO-ALIAS-${purchaseOrderId}`,
    businessId,
    supplierId,
    status: 'delivered',
    subtotalCents: 17000,
    deliveryFeeCents: 0,
    totalCents: 17000,
    currency: 'LKR',
    deliveryAddress: '1 Road',
    deliveryCity: 'Colombo',
    deliveryDistrict: 'Colombo',
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.purchaseOrderItems).values([
    { id: newId(), purchaseOrderId, supplierProductId: offers[0]!, productNameSnapshot: products[0]!.name, unitPriceCents: 250, unitPriceCentsSnapshot: 250, quantity: 20, lineTotalCents: 5000 },
    { id: newId(), purchaseOrderId, supplierProductId: offers[1]!, productNameSnapshot: products[1]!.name, unitPriceCents: 1200, unitPriceCentsSnapshot: 1200, quantity: 10, lineTotalCents: 12000 },
  ] as never);
  const uploadId = newId();
  await db.insert(schema.invoiceUploads).values({
    id: uploadId,
    businessId,
    uploadedByUserId: userId,
    supplierId: null,
    purchaseOrderId,
    status: 'ready',
    r2Key: 'invoice-alias/test.pdf',
    mimeType: 'application/pdf',
    originalFilename: 'supplier.pdf',
    sizeBytes: 100,
    createdAt: now,
  } as never);
  await db.insert(schema.invoiceLineItems).values({
    id: newId(),
    uploadId,
    businessId,
    lineNumber: 1,
    description: 'WHT. SGR 1KG',
    quantity: 20,
    unit: 'pack',
    unitPriceCents: 250,
    totalCents: 5000,
    categorySlug: 'other',
    categorySource: 'rule',
    productId: null,
  });

  sessionCtx = { userId, isAdmin: false, adminRole: null, businesses: [{ businessId, role: 'owner' }], suppliers: [] };
  return { app, env, db, schema, ids: { userId, businessId, otherBusinessId, supplierId, purchaseOrderId, uploadId, products } };
}

describe('invoice product alias review API', () => {
  it('returns the linked PO catalog candidates', async () => {
    const { app, env, ids } = await setup();
    const response = await app.fetch(new Request(`http://localhost/api/documents/${ids.uploadId}`), env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.upload.matchCandidates).toEqual([
      { productId: ids.products[0]!.id, productName: 'White Sugar 1kg', unit: 'pack' },
      { productId: ids.products[1]!.id, productName: 'Basmati Rice 5kg', unit: 'bag' },
    ]);
  });

  it('saves the buyer-selected product and learns/replaces the scoped alias', async () => {
    const { app, env, db, schema, ids } = await setup();
    const save = async (productId: string) => app.fetch(new Request(`http://localhost/api/documents/${ids.uploadId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        totalCents: 5000,
        lines: [{ lineNumber: 1, description: 'WHT. SGR 1KG', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000, productId }],
      }),
    }), env);

    const first = await save(ids.products[0]!.id);
    expect(first.status).toBe(200);
    const line = (await db.select().from(schema.invoiceLineItems).all())[0] as any;
    expect(line.productId).toBe(ids.products[0]!.id);
    let aliases = await db.select().from(schema.invoiceProductAliases).all();
    expect(aliases).toHaveLength(1);
    expect(aliases[0]!.supplierId).toBe(ids.supplierId);
    expect(aliases[0]!.productId).toBe(ids.products[0]!.id);

    const correction = await save(ids.products[1]!.id);
    expect(correction.status).toBe(200);
    aliases = await db.select().from(schema.invoiceProductAliases).all();
    expect(aliases).toHaveLength(1);
    expect(aliases[0]!.productId).toBe(ids.products[1]!.id);
    const audit = await db.select().from(schema.auditLogs).all();
    const changes = audit.filter((row: any) => row.action === 'invoice_product_alias.upsert');
    expect(changes).toHaveLength(2);
    expect(JSON.parse(changes[1]!.metadata!).previousProductId).toBe(ids.products[0]!.id);
    expect(JSON.parse(changes[1]!.metadata!).productId).toBe(ids.products[1]!.id);
    expect(changes.every((row: any) => !row.metadata.includes('WHT. SGR 1KG'))).toBe(true);
  });

  it('rejects a product outside the linked PO candidate list', async () => {
    const { app, env, db, schema, ids } = await setup();
    const response = await app.fetch(new Request(`http://localhost/api/documents/${ids.uploadId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ lineNumber: 1, description: 'WHT SGR 1KG', productId: 'not-a-po-product' }] }),
    }), env);
    expect(response.status).toBe(400);
    expect(await db.select().from(schema.invoiceProductAliases).all()).toHaveLength(0);
  });

  it('does not learn aliases for unlinked invoices', async () => {
    const { app, env, db, schema, ids } = await setup();
    await db.update(schema.invoiceUploads)
      .set({ purchaseOrderId: null })
      .where(eq(schema.invoiceUploads.id, ids.uploadId));
    const response = await app.fetch(new Request(`http://localhost/api/documents/${ids.uploadId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ lineNumber: 1, description: 'WHT SGR 1KG' }] }),
    }), env);
    expect(response.status).toBe(200);
    expect(await db.select().from(schema.invoiceProductAliases).all()).toHaveLength(0);
  });

  it('saves both lines but learns nothing when one review maps the same text to two products', async () => {
    const { app, env, db, schema, ids } = await setup();
    const response = await app.fetch(new Request(`http://localhost/api/documents/${ids.uploadId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        totalCents: 10000,
        lines: [
          { lineNumber: 1, description: 'WHT. SGR 1KG', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000, productId: ids.products[0]!.id },
          { lineNumber: 2, description: 'wht sgr 1kg', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000, productId: ids.products[1]!.id },
        ],
      }),
    }), env);
    expect(response.status).toBe(200);
    expect(await db.select().from(schema.invoiceLineItems).all()).toHaveLength(2);
    expect(await db.select().from(schema.invoiceProductAliases).all()).toHaveLength(0);
  });

  it('does not learn the generated Untitled line placeholder', async () => {
    const { app, env, db, schema, ids } = await setup();
    const response = await app.fetch(new Request(`http://localhost/api/documents/${ids.uploadId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ lineNumber: 1, description: 'Untitled line', quantity: 1, unitPriceCents: 100, totalCents: 100, productId: ids.products[0]!.id }],
      }),
    }), env);
    expect(response.status).toBe(200);
    expect(await db.select().from(schema.invoiceProductAliases).all()).toHaveLength(0);
  });

  it('still saves reviewed lines when alias persistence fails', async () => {
    const { app, env, db, schema, ids } = await setup();
    aliasPersistence.fail = true;
    const response = await app.fetch(new Request(`http://localhost/api/documents/${ids.uploadId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ lineNumber: 1, description: 'WHT. SGR 1KG', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000, productId: ids.products[0]!.id }],
      }),
    }), env);
    expect(response.status).toBe(200);
    const line = (await db.select().from(schema.invoiceLineItems).all())[0] as any;
    expect(line.productId).toBe(ids.products[0]!.id);
    expect(await db.select().from(schema.invoiceProductAliases).all()).toHaveLength(0);
  });
});
