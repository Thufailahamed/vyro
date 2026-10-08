import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../helpers/d1';

const now = Date.now();

async function createFixture() {
  const DB = makeD1();
  await applyMigrations(DB);
  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(DB);

  const userId = newId();
  await db.insert(schema.users).values({
    id: userId,
    email: `${userId}@test.invalid`,
    passwordHash: 'test',
    name: 'Buyer',
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
  await db.insert(schema.businessTypes).values({ id: businessTypeId, slug: `business-${businessTypeId}`, name: 'Business', active: true });
  const businessId = newId();
  await db.insert(schema.businesses).values({
    id: businessId,
    name: 'Buyer Co',
    businessTypeId,
    contactPerson: 'Buyer',
    phone: '0770000000',
    email: 'buyer@test.invalid',
    address: '1 Main Road',
    city: 'Colombo',
    district: 'Colombo',
    description: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  const supplierId = newId();
  await db.insert(schema.suppliers).values({
    id: supplierId,
    name: 'Wholesale Supplier',
    businessTypeId,
    contactPerson: 'Supplier',
    phone: '0770000001',
    email: 'supplier@test.invalid',
    address: '2 Market Road',
    city: 'Colombo',
    district: 'Colombo',
    description: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await db.insert(schema.businessMembers).values({
    id: newId(),
    businessId,
    userId,
    role: 'owner',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  const categoryId = newId();
  await db.insert(schema.categories).values({
    id: categoryId,
    slug: `staples-${categoryId}`,
    name: 'Staples',
    parentId: null,
    active: true,
  });
  const riceProductId = newId();
  const sugarProductId = newId();
  await db.insert(schema.products).values([
    {
      id: riceProductId,
      name: 'Basmati Rice 5kg',
      description: null,
      categoryId,
      brand: null,
      unit: 'bag',
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
    },
    {
      id: sugarProductId,
      name: 'White Sugar 1kg',
      description: null,
      categoryId,
      brand: null,
      unit: 'pack',
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
    },
  ]);
  const riceOfferId = newId();
  const sugarOfferId = newId();
  await db.insert(schema.supplierProducts).values([
    { id: riceOfferId, supplierId, productId: riceProductId, priceCents: 1200, minOrderQty: 1, stockQty: 100, availabilityStatus: 'in_stock', createdAt: now, updatedAt: now },
    { id: sugarOfferId, supplierId, productId: sugarProductId, priceCents: 250, minOrderQty: 1, stockQty: 100, availabilityStatus: 'in_stock', createdAt: now, updatedAt: now },
  ] as never);

  const orderId = newId();
  await db.insert(schema.purchaseOrders).values({
    id: orderId,
    poNumber: `PO-${orderId}`,
    businessId,
    supplierId,
    status: 'delivered',
    subtotalCents: 17000,
    deliveryFeeCents: 0,
    totalCents: 17000,
    currency: 'LKR',
    deliveryAddress: '1 Main Road',
    deliveryCity: 'Colombo',
    deliveryDistrict: 'Colombo',
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });
  const ricePoItemId = newId();
  const sugarPoItemId = newId();
  await db.insert(schema.purchaseOrderItems).values([
    { id: ricePoItemId, purchaseOrderId: orderId, supplierProductId: riceOfferId, productNameSnapshot: 'Basmati Rice 5kg', unitPriceCents: 1200, unitPriceCentsSnapshot: 1200, quantity: 10, lineTotalCents: 12000 },
    { id: sugarPoItemId, purchaseOrderId: orderId, supplierProductId: sugarOfferId, productNameSnapshot: 'White Sugar 1kg', unitPriceCents: 250, unitPriceCentsSnapshot: 250, quantity: 20, lineTotalCents: 5000 },
  ] as never);
  await db.insert(schema.deliveries).values({
    id: newId(),
    purchaseOrderId: orderId,
    status: 'delivered',
    deliveredAt: now,
    createdAt: now,
    updatedAt: now,
  } as never);

  const uploadId = newId();
  await db.insert(schema.invoiceUploads).values({
    id: uploadId,
    businessId,
    uploadedByUserId: userId,
    status: 'ready',
    r2Key: 'invoice-key',
    mimeType: 'application/pdf',
    originalFilename: 'supplier-invoice.pdf',
    sizeBytes: 100,
    purchaseOrderId: orderId,
    createdAt: now,
  } as never);
  await db.insert(schema.invoiceLineItems).values([
    {
      id: newId(),
      uploadId,
      businessId,
      lineNumber: 1,
      description: 'Basmati Rice 5kg',
      quantity: 10,
      unit: 'bag',
      unitPriceCents: 1200,
      totalCents: 12000,
      categorySlug: 'staples',
      categorySource: 'rule',
      productId: riceProductId,
    },
    {
      id: newId(),
      uploadId,
      businessId,
      lineNumber: 2,
      description: 'WHT SGR 1KG',
      quantity: 20,
      unit: 'pack',
      unitPriceCents: 300,
      totalCents: 6000,
      categorySlug: 'staples',
      categorySource: 'rule',
      productId: null,
    },
  ]);
  const aiRun = vi.fn(async (_model: string, payload: Record<string, any>) => {
    if (payload.response_format) {
      return {
        response: JSON.stringify({
          matches: [
            {
              invoiceItemIndex: 1,
              poItemId: sugarPoItemId,
              confidence: 0.98,
              alternativeConfidence: 0.1,
              reason: 'Abbreviation and pack size match.',
            },
          ],
        }),
        usage: { prompt_tokens: 20, completion_tokens: 14 },
      };
    }
    return { response: 'Please review and amend the invoice for the listed line variance.', usage: {} };
  });

  return {
    env: {
      DB,
      AI: { run: aiRun },
      ENVIRONMENT: 'test',
      VYRO_AI_RECONCILE_MATCHING: 'true',
      VYRO_AI_RECONCILE_MODEL: '@cf/test/reconcile',
      VYRO_AI_NARRATE_MODEL: '@cf/test/narrate',
      NOTIFICATIONS_QUEUE: { send: async () => null },
    } as any,
    orderId,
    uploadId,
    sugarPoItemId,
    aiRun,
  };
}

describe('AI-assisted stored invoice reconciliation', () => {
  it('rescues an OCR abbreviation and still detects its billed price variance', async () => {
    const fixture = await createFixture();
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId });
    const sugar = result.lines.find((line) => line.poItemId === fixture.sugarPoItemId);

    expect(sugar?.status).toBe('price_variance');
    expect(sugar?.matchSource).toBe('ai');
    expect(sugar?.matchConfidence).toBe(0.98);
    expect(sugar?.matchExplanation).toBe('Abbreviation and pack size match.');
    expect(fixture.aiRun.mock.calls.some(([, payload]) => Boolean(payload.response_format))).toBe(true);
  });

  it('leaves uploads deterministic-only when the feature switch is false', async () => {
    const fixture = await createFixture();
    fixture.env.VYRO_AI_RECONCILE_MATCHING = 'false';
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId });

    expect(result.lines.some((line) => line.status === 'unexpected_item')).toBe(true);
    expect(fixture.aiRun.mock.calls.some(([, payload]) => Boolean(payload.response_format))).toBe(false);
  });

  it('keeps manually supplied invoice data deterministic-only', async () => {
    const fixture = await createFixture();
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, {
      invoiceData: {
        totalCents: 18000,
        items: [
          { description: 'Basmati Rice 5kg', quantity: 10, unitPriceCents: 1200, totalCents: 12000 },
          { description: 'WHT SGR 1KG', quantity: 20, unitPriceCents: 300, totalCents: 6000 },
        ],
      },
    });

    expect(result.lines.some((line) => line.status === 'unexpected_item')).toBe(true);
    expect(fixture.aiRun.mock.calls.some(([, payload]) => Boolean(payload.response_format))).toBe(false);
  });

  it('keeps same-business unlinked uploads deterministic-only', async () => {
    const fixture = await createFixture();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(fixture.env.DB);
    await db.update(schema.invoiceUploads)
      .set({ purchaseOrderId: null })
      .where(eq(schema.invoiceUploads.id, fixture.uploadId));
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId });

    expect(result.lines.some((line) => line.status === 'unexpected_item')).toBe(true);
    expect(fixture.aiRun.mock.calls.some(([, payload]) => Boolean(payload.response_format))).toBe(false);
  });

  it('rejects a cross-business or differently linked invoice upload before AI dispatch', async () => {
    const fixture = await createFixture();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(fixture.env.DB);
    const types = await db.select().from(schema.businessTypes).all();
    const otherBusinessId = newId();
    await db.insert(schema.businesses).values({
      id: otherBusinessId,
      name: 'Other Buyer Co',
      businessTypeId: types[0]!.id,
      contactPerson: 'Other Buyer',
      phone: '0770000002',
      email: 'other-buyer@test.invalid',
      address: '3 Main Road',
      city: 'Colombo',
      district: 'Colombo',
      description: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await db.update(schema.invoiceUploads)
      .set({ businessId: otherBusinessId })
      .where(eq(schema.invoiceUploads.id, fixture.uploadId));

    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    await expect(
      runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId }),
    ).rejects.toMatchObject({ status: 403 });

    // Restore ownership, then link the upload to a different PO in the same
    // business. The service must reject this mismatched link too.
    const order = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, fixture.orderId)).get();
    const otherOrderId = newId();
    await db.insert(schema.purchaseOrders).values({
      id: otherOrderId,
      poNumber: `PO-OTHER-${otherOrderId}`,
      businessId: order!.businessId,
      supplierId: order!.supplierId,
      status: 'delivered',
      subtotalCents: 100,
      deliveryFeeCents: 0,
      totalCents: 100,
      currency: 'LKR',
      deliveryAddress: '4 Main Road',
      deliveryCity: 'Colombo',
      deliveryDistrict: 'Colombo',
      createdByUserId: order!.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    await db.update(schema.invoiceUploads)
      .set({ businessId: order!.businessId, purchaseOrderId: otherOrderId })
      .where(eq(schema.invoiceUploads.id, fixture.uploadId));
    await expect(
      runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fixture.aiRun).not.toHaveBeenCalled();
  });

  it('falls back to deterministic results when the matching model returns malformed JSON', async () => {
    const fixture = await createFixture();
    fixture.env.AI.run = vi.fn(async (_model: string, payload: Record<string, any>) =>
      payload.response_format
        ? { response: 'not-json', usage: {} }
        : { response: 'Please review the invoice line variance before payment.', usage: {} },
    );
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId });

    expect(result.lines.some((line) => line.status === 'unexpected_item')).toBe(true);
    expect(result.lines.some((line) => line.matchSource === 'ai')).toBe(false);
  });
});

describe('alias-first invoice reconciliation', () => {
  async function aliasFixture() {
    const fixture = await createFixture();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(fixture.env.DB);
    const po = (await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, fixture.orderId)).get()) as any;
    const sugarProduct = (await db.select().from(schema.products).where(eq(schema.products.name, 'White Sugar 1kg')).get()) as any;
    const user = (await db.select().from(schema.users).all())[0] as any;
    return { fixture, db, schema, newId, po, sugarProductId: sugarProduct.id, userId: user.id };
  }

  it('applies a scoped exact alias before Jaccard or AI', async () => {
    const { fixture, db, schema, newId, po, sugarProductId, userId } = await aliasFixture();
    await db.insert(schema.invoiceProductAliases).values({
      id: newId(),
      businessId: po.businessId,
      supplierId: po.supplierId,
      normalizedAlias: 'wht sgr 1kg',
      productId: sugarProductId,
      sourceUploadId: fixture.uploadId,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId });
    const sugar = result.lines.find((line) => line.poItemId === fixture.sugarPoItemId);

    expect(sugar?.status).toBe('price_variance');
    expect(sugar?.matchSource).toBe('alias');
    expect(sugar?.matchConfidence).toBe(1);
    expect(sugar?.matchExplanation).toBe('Previously confirmed supplier alias.');
    expect(fixture.aiRun.mock.calls.some(([, payload]) => Boolean(payload.response_format))).toBe(false);
  });

  it('ignores aliases from another business or supplier', async () => {
    const { fixture, db, schema, newId, po, sugarProductId, userId } = await aliasFixture();
    const otherBusinessId = newId();
    const types = await db.select().from(schema.businessTypes).all();
    await db.insert(schema.businesses).values({
      id: otherBusinessId, name: 'Other', businessTypeId: types[0]!.id, contactPerson: 'O', phone: '1', email: 'o@alias.test', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
    });
    await db.insert(schema.invoiceProductAliases).values({
      id: newId(),
      businessId: otherBusinessId,
      supplierId: po.supplierId,
      normalizedAlias: 'wht sgr 1kg',
      productId: sugarProductId,
      sourceUploadId: fixture.uploadId,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId });

    expect(result.lines.some((line) => line.matchSource === 'alias')).toBe(false);
  });

  it('ignores an alias whose product is absent from the current PO', async () => {
    const { fixture, db, schema, newId, po, userId } = await aliasFixture();
    const category = (await db.select().from(schema.categories).all())[0] as any;
    const ghostProductId = newId();
    await db.insert(schema.products).values({
      id: ghostProductId, name: 'Ghost Lentils 1kg', description: null, categoryId: category.id, brand: null, unit: 'pack', packSize: null, active: true, featured: false, moderationNotes: null, createdAt: now, updatedAt: now, deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false,
    });
    await db.insert(schema.invoiceProductAliases).values({
      id: newId(),
      businessId: po.businessId,
      supplierId: po.supplierId,
      normalizedAlias: 'wht sgr 1kg',
      productId: ghostProductId,
      sourceUploadId: fixture.uploadId,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId });

    expect(result.lines.some((line) => line.matchSource === 'alias')).toBe(false);
  });

  it('leaves duplicate-product PO lines to deterministic or AI matching', async () => {
    const { fixture, db, schema, newId, po, sugarProductId, userId } = await aliasFixture();
    const sugarOffer = (await db.select().from(schema.supplierProducts).all()).find((o: any) => o.productId === sugarProductId) as any;
    await db.insert(schema.purchaseOrderItems).values({
      id: newId(), purchaseOrderId: fixture.orderId, supplierProductId: sugarOffer.id, productNameSnapshot: 'White Sugar 1kg (second bag)', unitPriceCents: 250, unitPriceCentsSnapshot: 250, quantity: 20, lineTotalCents: 5000,
    } as never);
    await db.insert(schema.invoiceProductAliases).values({
      id: newId(),
      businessId: po.businessId,
      supplierId: po.supplierId,
      normalizedAlias: 'wht sgr 1kg',
      productId: sugarProductId,
      sourceUploadId: fixture.uploadId,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const { runThreeWayReconciliation } = await import('../../src/modules/reconciliation/reconciliationService');
    const result = await runThreeWayReconciliation(fixture.env, fixture.orderId, { invoiceUploadId: fixture.uploadId });

    expect(result.lines.some((line) => line.matchSource === 'alias')).toBe(false);
  });
});
