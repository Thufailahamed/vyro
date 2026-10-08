import { describe, expect, it } from 'vitest';

const items = [
  { description: 'Basmati Rice 5kg', quantity: 10, unit: 'bag', unitPriceCents: 1200, totalCents: 12000 },
  { description: 'White Sugar 1kg', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000 },
];

async function seedUpload(db: ReturnType<typeof import('@vyro/db')['getDb']>) {
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const now = Date.now();
  const userId = newId();
  await db.insert(schema.users).values({ id: userId, email: `${userId}@t`, passwordHash: 'x', name: 'u', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const btId = newId();
  await db.insert(schema.businessTypes).values({ id: btId, slug: `t-${btId}`, name: 'T', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: btId, contactPerson: 'B', phone: '1', email: 'b@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const uploadId = newId();
  await db.insert(schema.invoiceUploads).values({ id: uploadId, businessId: biz, uploadedByUserId: userId, status: 'ready', r2Key: 'k', mimeType: 'image/png', originalFilename: 'i.png', sizeBytes: 4, createdAt: now } as any);
  return { biz, uploadId };
}

describe('persistOcrLines', () => {
  it('stages rule-categorized line items for the upload', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { makeD1, applyMigrations } = await import('../helpers/d1');
    const d1 = makeD1();
    await applyMigrations(d1);
    const env: any = { DB: d1 };
    const { biz, uploadId } = await seedUpload(getDb(d1));
    const { persistOcrLines } = await import('../../src/modules/documents/autoStage');
    const out = await persistOcrLines(env, { id: uploadId, businessId: biz }, items);
    expect(out.staged).toBe(2);
    const rows = await getDb(d1).select().from(schema.invoiceLineItems).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.categorySource === 'rule')).toBe(true);
    expect(rows.every((r: any) => r.categorySlug && r.categorySlug.length > 0)).toBe(true);
  });

  it('re-staging replaces previous rows instead of duplicating', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { makeD1, applyMigrations } = await import('../helpers/d1');
    const d1 = makeD1();
    await applyMigrations(d1);
    const env: any = { DB: d1 };
    const { persistOcrLines } = await import('../../src/modules/documents/autoStage');
    const { biz, uploadId } = await seedUpload(getDb(d1));
    await persistOcrLines(env, { id: uploadId, businessId: biz }, items);
    await persistOcrLines(env, { id: uploadId, businessId: biz }, items);
    const rows = await getDb(d1).select().from(schema.invoiceLineItems).all();
    expect(rows).toHaveLength(2);
  });
});
