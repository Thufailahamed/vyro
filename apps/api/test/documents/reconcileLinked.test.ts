import { describe, expect, it, beforeAll, vi } from 'vitest';
import { makeD1, applyMigrations } from '../helpers/d1';

let env: any;

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (c.get('ctx')) return next();
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

const now = Date.now();

async function seedBase(db: any, schema: any, newId: () => string) {
  const userId = newId();
  await db.insert(schema.users).values({ id: userId, email: `${userId}@t`, passwordHash: 'x', name: 'u', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: `t-${bt}`, name: 'T', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '1', email: 'b@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '1', email: 'su@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: biz, userId, role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  // Real catalog so purchase_order_items.supplier_product_id FK holds.
  const cat = newId();
  await db.insert(schema.categories).values({ id: cat, slug: `staples-${cat}`, name: 'Staples', parentId: null, active: true });
  const products = [
    { slug: 'rice', name: 'Basmati Rice 5kg' },
    { slug: 'sugar', name: 'White Sugar 1kg' },
  ].map((p) => ({ id: newId(), ...p }));
  const offers: string[] = [];
  for (const p of products) {
    await db.insert(schema.products).values({ id: p.id, name: p.name, description: null, categoryId: cat, brand: null, unit: 'bag', packSize: null, active: true, featured: false, moderationNotes: null, createdAt: now, updatedAt: now, deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false });
    const offer = newId();
    await db.insert(schema.supplierProducts).values({ id: offer, supplierId: sup, productId: p.id, priceCents: p.slug === 'rice' ? 1200 : 250, minOrderQty: 1, stockQty: 10000, availabilityStatus: 'in_stock', createdAt: now, updatedAt: now } as never);
    offers.push(offer);
  }
  return { userId, biz, sup, products, offers };
}

/** PO with two items; optionally bump one price to force a discrepancy. */
async function seedPoAndDelivery(db: any, schema: any, ids: any, newId: () => string, bump: boolean) {
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: `PO-RL-${poId}`, businessId: ids.biz, supplierId: ids.sup, status: 'delivered', subtotalCents: 17000, deliveryFeeCents: 0, totalCents: 17000, currency: 'LKR', deliveryAddress: 'x', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: ids.userId, createdAt: now, updatedAt: now });
  await db.insert(schema.purchaseOrderItems).values([
    { id: newId(), purchaseOrderId: poId, supplierProductId: ids.offers[0], productNameSnapshot: 'Basmati Rice 5kg', unitPriceCents: 1200, unitPriceCentsSnapshot: 1200, quantity: 10, lineTotalCents: 12000 } as never,
    { id: newId(), purchaseOrderId: poId, supplierProductId: ids.offers[1], productNameSnapshot: 'White Sugar 1kg', unitPriceCents: bump ? 300 : 250, unitPriceCentsSnapshot: bump ? 300 : 250, quantity: 20, lineTotalCents: bump ? 6000 : 5000 } as never,
  ]);
  await db.insert(schema.deliveries).values({ id: newId(), purchaseOrderId: poId, status: 'delivered', deliveredAt: now, createdAt: now, updatedAt: now } as any);
  return poId;
}

let base: { userId: string; biz: string; sup: string };

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env = { DB: d1, NOTIFICATIONS_QUEUE: { send: async () => null }, ENVIRONMENT: 'test' };
  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  base = await seedBase(db, schema, newId);
}, 60000);

describe('reconcileIfLinked', () => {
  it('flags discrepancy, notifies buyer, opens an exception', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const poId = await seedPoAndDelivery(db, schema, { ...base, bump: undefined } as any, newId, true);
    // upload with inflated price on line 2 (billed 300 vs PO 250 → price_variance)
    const uploadId = newId();
    await db.insert(schema.invoiceUploads).values({ id: uploadId, businessId: base.biz, uploadedByUserId: base.userId, status: 'ready', r2Key: 'k', mimeType: 'image/png', originalFilename: 'i.png', sizeBytes: 4, purchaseOrderId: poId, createdAt: now } as any);
    await db.insert(schema.invoiceLineItems).values([
      { id: newId(), uploadId, businessId: base.biz, lineNumber: 1, description: 'Basmati Rice 5kg', quantity: 10, unit: 'bag', unitPriceCents: 1200, totalCents: 12000, categorySlug: 'grain', categorySource: 'rule', productId: null },
      { id: newId(), uploadId, businessId: base.biz, lineNumber: 2, description: 'White Sugar 1kg', quantity: 20, unit: 'pack', unitPriceCents: 300, totalCents: 6000, categorySlug: 'sugar', categorySource: 'rule', productId: null },
    ]);

    const { reconcileIfLinked } = await import('../../src/modules/documents/reconcile');
    await reconcileIfLinked(env, uploadId);

    const upload = (await db.select().from(schema.invoiceUploads).all()).find((u: any) => u.id === uploadId) as any;
    expect(upload.reconciliationStatus).toBe('discrepancy');
    const payload = JSON.parse(upload.reconciliationJson);
    expect(payload.netDifferenceCents).toBeGreaterThan(0);

    const exceptions = await db.select().from(schema.reconciliationExceptions).all();
    const ex = exceptions.find((e: any) => e.entityId === poId) as any;
    expect(ex).toBeTruthy();
    expect(ex.kind).toBe('amount_mismatch');
    expect(ex.status).toBe('open');

    const notes = await db.select().from(schema.notifications).all();
    expect(notes.some((n: any) => n.type === 'order.reconciliation.discrepancy' && n.userId === base.userId)).toBe(true);
  });

  it('marks passed with no exception when everything matches', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const poId = await seedPoAndDelivery(db, schema, base as any, newId, false);
    const uploadId = newId();
    await db.insert(schema.invoiceUploads).values({ id: uploadId, businessId: base.biz, uploadedByUserId: base.userId, status: 'ready', r2Key: 'k', mimeType: 'image/png', originalFilename: 'i.png', sizeBytes: 4, purchaseOrderId: poId, createdAt: now } as any);
    await db.insert(schema.invoiceLineItems).values([
      { id: newId(), uploadId, businessId: base.biz, lineNumber: 1, description: 'Basmati Rice 5kg', quantity: 10, unit: 'bag', unitPriceCents: 1200, totalCents: 12000, categorySlug: 'grain', categorySource: 'rule', productId: null },
      { id: newId(), uploadId, businessId: base.biz, lineNumber: 2, description: 'White Sugar 1kg', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000, categorySlug: 'sugar', categorySource: 'rule', productId: null },
    ]);
    const { reconcileIfLinked } = await import('../../src/modules/documents/reconcile');
    await reconcileIfLinked(env, uploadId);
    const upload = (await db.select().from(schema.invoiceUploads).all()).find((u: any) => u.id === uploadId) as any;
    expect(upload.reconciliationStatus).toBe('passed');
    const exceptions = await db.select().from(schema.reconciliationExceptions).all();
    expect(exceptions.find((e: any) => e.entityId === poId)).toBeUndefined();
    const notes = await db.select().from(schema.notifications).all();
    expect(notes.some((n: any) => n.type === 'order.reconciliation.discrepancy' && n.body?.includes('Matched'))).toBe(false);
  });

  it('no-ops for uploads without a PO link', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const uploadId = newId();
    await db.insert(schema.invoiceUploads).values({ id: uploadId, businessId: base.biz, uploadedByUserId: base.userId, status: 'ready', r2Key: 'k', mimeType: 'image/png', originalFilename: 'i.png', sizeBytes: 4, createdAt: now } as any);
    const { reconcileIfLinked } = await import('../../src/modules/documents/reconcile');
    await reconcileIfLinked(env, uploadId);
    const upload = (await db.select().from(schema.invoiceUploads).all()).find((u: any) => u.id === uploadId) as any;
    expect(upload.reconciliationStatus).toBe('none');
  });

  it('fails gracefully for POs not yet delivered', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const poId = newId();
    await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: 'PO-RL-DRAFT', businessId: base.biz, supplierId: base.sup, status: 'drafting', subtotalCents: 100, deliveryFeeCents: 0, totalCents: 100, currency: 'LKR', deliveryAddress: 'x', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: base.userId, createdAt: now, updatedAt: now });
    const uploadId = newId();
    await db.insert(schema.invoiceUploads).values({ id: uploadId, businessId: base.biz, uploadedByUserId: base.userId, status: 'ready', r2Key: 'k', mimeType: 'image/png', originalFilename: 'i.png', sizeBytes: 4, purchaseOrderId: poId, createdAt: now } as any);
    const { reconcileIfLinked } = await import('../../src/modules/documents/reconcile');
    await reconcileIfLinked(env, uploadId);
    const upload = (await db.select().from(schema.invoiceUploads).all()).find((u: any) => u.id === uploadId) as any;
    expect(upload.reconciliationStatus).toBe('failed');
    expect(JSON.parse(upload.reconciliationJson).error).toContain('delivered');
    const exceptions = await db.select().from(schema.reconciliationExceptions).all();
    expect(exceptions.find((e: any) => e.entityId === poId)).toBeUndefined();
  });

  it('does not stack duplicate exceptions on re-run', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const poId = await seedPoAndDelivery(db, schema, base as any, newId, true);
    const uploadId = newId();
    await db.insert(schema.invoiceUploads).values({ id: uploadId, businessId: base.biz, uploadedByUserId: base.userId, status: 'ready', r2Key: 'k', mimeType: 'image/png', originalFilename: 'i.png', sizeBytes: 4, purchaseOrderId: poId, createdAt: now } as any);
    await db.insert(schema.invoiceLineItems).values([
      { id: newId(), uploadId, businessId: base.biz, lineNumber: 1, description: 'Basmati Rice 5kg', quantity: 10, unit: 'bag', unitPriceCents: 1200, totalCents: 12000, categorySlug: 'grain', categorySource: 'rule', productId: null },
      { id: newId(), uploadId, businessId: base.biz, lineNumber: 2, description: 'White Sugar 1kg', quantity: 20, unit: 'pack', unitPriceCents: 300, totalCents: 6000, categorySlug: 'sugar', categorySource: 'rule', productId: null },
    ]);
    const { reconcileIfLinked } = await import('../../src/modules/documents/reconcile');
    await reconcileIfLinked(env, uploadId);
    await reconcileIfLinked(env, uploadId);
    const exceptions = await db.select().from(schema.reconciliationExceptions).all();
    expect(exceptions.filter((e: any) => e.entityId === poId)).toHaveLength(1);
  });
});
