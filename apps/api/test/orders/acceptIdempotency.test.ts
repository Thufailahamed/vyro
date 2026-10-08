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

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    env,
  );
}

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
  const router = (await import('../../src/modules/purchaseOrders/routes')).default;
  app.route('/api/purchase-orders', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values([
    { id: 'buyer', email: 'buyer@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'sup-u', email: 'sup@t', passwordHash: 'x', name: 's', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
  ]);
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const cat = newId();
  await db.insert(schema.categories).values({ id: cat, slug: 'staples', name: 'Staples', active: true, sortOrder: 0 });
  const pid = newId();
  await db.insert(schema.products).values({ id: pid, name: 'Rice 5kg', categoryId: cat, unit: 'bag', createdAt: now, updatedAt: now });
  const spId = newId();
  await db.insert(schema.supplierProducts).values({ id: spId, supplierId: sup, productId: pid, priceCents: 10000, minOrderQty: 1, stockQty: 100, trackInventory: true, leadTimeDays: 2, createdAt: now, updatedAt: now });
  const mkPo = async (n: number) => {
    const poId = newId();
    await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: `PO-ACC-${n}`, businessId: biz, supplierId: sup, status: 'pending', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'buyer', createdAt: now, updatedAt: now });
    await db.insert(schema.purchaseOrderItems).values({ id: newId(), purchaseOrderId: poId, supplierProductId: spId, productNameSnapshot: 'Rice 5kg', unitPriceCents: 10000, unitPriceCentsSnapshot: 10000, quantity: 1, requestedQuantity: 1, lineTotalCents: 10000 });
    return poId;
  };
  ids.biz = biz;
  ids.sup = sup;
  ids.po1 = await mkPo(1);
  ids.po2 = await mkPo(2);
}, 60000);

const supplier = () => ({ userId: 'sup-u', isAdmin: false, adminRole: null, businesses: [], suppliers: [{ supplierId: ids.sup, role: 'owner' }] });

describe('POST /api/purchase-orders/:id/accept idempotency', () => {
  it('replays the stored response and writes one accepted event', async () => {
    sessionCtx = supplier();
    const key = 'idem-accept-replay';
    const r1 = await post(`/api/purchase-orders/${ids.po1}/accept`, {}, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.status).toBe('accepted');

    const r2 = await post(`/api/purchase-orders/${ids.po1}/accept`, {}, { 'Idempotency-Key': key });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual(body1);

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const events = (await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.purchaseOrderId, ids.po1)).all()) as any[];
    expect(events.filter((e) => e.toStatus === 'accepted')).toHaveLength(1);
  });

  it('rejects key reuse with a different payload', async () => {
    sessionCtx = supplier();
    const key = 'idem-accept-mismatch';
    const r1 = await post(`/api/purchase-orders/${ids.po2}/accept`, { note: 'first' }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);

    const r2 = await post(`/api/purchase-orders/${ids.po2}/accept`, { note: 'different' }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(409);
  });

  it('leaves keyless callers unchanged', async () => {
    sessionCtx = supplier();
    const res = await post(`/api/purchase-orders/${ids.po1}/accept`, {});
    expect(res.status).toBe(409);
  });
});
