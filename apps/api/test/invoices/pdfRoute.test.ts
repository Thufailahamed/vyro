import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../helpers/d1';

let app: Hono;
let sessionCtx: any = null;

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

const env: any = { DB: null, NOTIFICATIONS_QUEUE: undefined, AUDIT_QUEUE: undefined, INVOICES_QUEUE: undefined, ENVIRONMENT: 'test' };
const ids: Record<string, any> = {};

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  const router = (await import('../../src/modules/invoices/routes')).default;
  app.route('/api/invoices', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values([
    { id: 'u-buyer', email: 'buyer@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'u-stranger', email: 'stranger@t', passwordHash: 'x', name: 's', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
  ]);
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'Buyer Ltd', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'Mill Ltd', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: biz, userId: 'u-buyer', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: 'PO-PDF-1', businessId: biz, supplierId: sup, status: 'delivered', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-buyer', createdAt: now, updatedAt: now });
  const invId = newId();
  await db.insert(schema.invoices).values({ id: invId, number: 'RCP-2026-0001', type: 'receipt', purchaseOrderId: poId, businessId: biz, supplierId: sup, subtotalCents: 10000, taxCents: 0, vatCents: 0, ssclCents: 0, totalCents: 10000, currency: 'LKR', issuedAt: now, htmlSnapshot: '<html></html>', createdAt: now });
  await db.insert(schema.invoiceItems).values({ id: newId(), invoiceId: invId, description: 'Rice 5kg', quantity: 10, unitCents: 1000, lineTotalCents: 10000 });
  ids.biz = biz;
  ids.invId = invId;
}, 60000);

describe('GET /api/invoices/:id/pdf', () => {
  it('streams a PDF to a participant and stamps pdf_generated_at', async () => {
    sessionCtx = { userId: 'u-buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] };
    const res = await app.fetch(new Request(`http://localhost/api/invoices/${ids.invId}/pdf`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('RCP-2026-0001.pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const row = (await db.select().from(schema.invoices).where(eq(schema.invoices.id, ids.invId)).get()) as any;
    expect(row.pdfGeneratedAt).toBeGreaterThan(0);
  });

  it('is 403 for a non-participant', async () => {
    sessionCtx = { userId: 'u-stranger', isAdmin: false, adminRole: null, businesses: [], suppliers: [] };
    const res = await app.fetch(new Request(`http://localhost/api/invoices/${ids.invId}/pdf`), env);
    expect(res.status).toBe(403);
  });
});
