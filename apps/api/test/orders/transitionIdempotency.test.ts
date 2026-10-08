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
  await db.insert(schema.users).values({ id: 'buyer', email: 'buyer@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const mkPo = async (n: number) => {
    const id = newId();
    await db.insert(schema.purchaseOrders).values({ id, poNumber: `PO-IDEM-${n}`, businessId: biz, supplierId: sup, status: 'pending', subtotalCents: 1000, deliveryFeeCents: 0, totalCents: 1000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'buyer', createdAt: now, updatedAt: now });
    return id;
  };
  ids.biz = biz;
  ids.po1 = await mkPo(1);
  ids.po2 = await mkPo(2);
}, 60000);

const buyer = () => ({ userId: 'buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });

describe('POST /api/purchase-orders/:id/transition idempotency', () => {
  it('replays the stored response and writes one event', async () => {
    sessionCtx = buyer();
    const key = 'idem-transition-replay';
    const r1 = await post(`/api/purchase-orders/${ids.po1}/transition`, { to: 'cancelled', reason: 'changed mind' }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();

    const r2 = await post(`/api/purchase-orders/${ids.po1}/transition`, { to: 'cancelled', reason: 'changed mind' }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual(body1);

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const events = (await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.purchaseOrderId, ids.po1)).all()) as any[];
    expect(events.filter((e) => e.toStatus === 'cancelled')).toHaveLength(1);
  });

  it('rejects key reuse with a different payload', async () => {
    sessionCtx = buyer();
    const key = 'idem-transition-mismatch';
    const r1 = await post(`/api/purchase-orders/${ids.po2}/transition`, { to: 'cancelled', reason: 'first' }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);

    const r2 = await post(`/api/purchase-orders/${ids.po2}/transition`, { to: 'disputed', reason: 'different' }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(409);
  });

  it('leaves keyless callers unchanged', async () => {
    sessionCtx = buyer();
    const res = await post(`/api/purchase-orders/${ids.po2}/transition`, { to: 'cancelled', reason: 'again' });
    expect(res.status).toBe(409);
  });
});
