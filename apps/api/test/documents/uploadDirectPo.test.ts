import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
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

const env: any = {
  DB: null,
  INVOICES: null,
  AUDIT_QUEUE: undefined,
  NOTIFICATIONS_QUEUE: undefined,
  UPLOADS_QUEUE: undefined,
  INVOICES_QUEUE: { send: async () => null },
  METRICS: undefined,
  ENVIRONMENT: 'test',
};
const ids: Record<string, any> = {};

const buyerCtx = () => ({ userId: 'u-b', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });

function multipart(purchaseOrderId?: string): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3, 4])], 'inv.png', { type: 'image/png' }));
  if (purchaseOrderId) form.append('purchaseOrderId', purchaseOrderId);
  return form;
}

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  env.INVOICES = { put: async () => null, get: async () => null };
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => c.json(errorEnvelope(err).body, errorEnvelope(err).status as any));
  const router = (await import('../../src/modules/documents/routes')).default;
  app.route('/api/documents', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values({ id: 'u-b', email: 'b@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'rest', name: 'Rest', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '1', email: 'b@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '1', email: 'su@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: biz, userId: 'u-b', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  ids.biz = biz;
  ids.sup = sup;
  const del = newId();
  await db.insert(schema.purchaseOrders).values({ id: del, poNumber: 'PO-DOC-1', businessId: biz, supplierId: sup, status: 'delivered', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: 'x', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-b', createdAt: now, updatedAt: now });
  const drafting = newId();
  await db.insert(schema.purchaseOrders).values({ id: drafting, poNumber: 'PO-DOC-2', businessId: biz, supplierId: sup, status: 'drafting', subtotalCents: 5000, deliveryFeeCents: 0, totalCents: 5000, currency: 'LKR', deliveryAddress: 'x', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-b', createdAt: now, updatedAt: now });
  ids.poDelivered = del;
  ids.poDrafting = drafting;
}, 60000);

async function post(form: FormData) {
  return app.fetch(new Request('http://localhost/api/documents/upload-direct', { method: 'POST', body: form }), env);
}

describe('POST /api/documents/upload-direct with purchaseOrderId', () => {
  it('stores the po reference on a delivered PO', async () => {
    sessionCtx = buyerCtx();
    const res = await post(multipart(ids.poDelivered));
    expect(res.status).toBe(200);
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const upload = (await db.select().from(schema.invoiceUploads).all())[0] as any;
    expect(upload.purchaseOrderId).toBe(ids.poDelivered);
    expect(upload.reconciliationStatus).toBe('none');
    ids.upload = upload.id;
  });

  it('rejects a PO owned by another business with 403', async () => {
    sessionCtx = buyerCtx();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const bt = (await db.select().from(schema.businessTypes).all())[0] as any;
    const otherBiz = newId();
    await db.insert(schema.businesses).values({ id: otherBiz, name: 'B2', businessTypeId: bt.id, contactPerson: 'B', phone: '1', email: 'b2@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
    const foreignPo = newId();
    await db.insert(schema.purchaseOrders).values({ id: foreignPo, poNumber: 'PO-DOC-3', businessId: otherBiz, supplierId: ids.sup, status: 'delivered', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: 'x', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-b', createdAt: now, updatedAt: now });
    const res = await post(multipart(foreignPo));
    expect(res.status).toBe(403);
  });

  it('rejects POs not yet delivered with 400', async () => {
    sessionCtx = buyerCtx();
    const res = await post(multipart(ids.poDrafting));
    expect(res.status).toBe(400);
  });

  it('accepts uploads without a PO reference unchanged', async () => {
    sessionCtx = buyerCtx();
    const res = await post(multipart());
    expect(res.status).toBe(200);
  });
});
