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

const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  ENVIRONMENT: 'test',
};
const ids: Record<string, any> = {};

async function post(path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
  const router = (await import('../../src/modules/refunds/routes')).default;
  app.route('/api/refunds', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values([
    { id: 'u-buyer', email: 'buyer@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'u-other', email: 'other@t', passwordHash: 'x', name: 'o', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'u-admin', email: 'admin@t', passwordHash: 'x', name: 'a', phone: null, avatarUrl: null, adminRole: 'finance', status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
  ]);
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.businessMembers).values([
    { id: newId(), businessId: biz, userId: 'u-buyer', role: 'owner', status: 'active', createdAt: now, updatedAt: now },
    { id: newId(), businessId: biz, userId: 'u-other', role: 'owner', status: 'active', createdAt: now, updatedAt: now },
  ]);
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: 'PO-RC-1', businessId: biz, supplierId: sup, status: 'delivered', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-buyer', createdAt: now, updatedAt: now });
  const payId = newId();
  await db.insert(schema.payments).values({ id: payId, purchaseOrderId: poId, businessId: biz, supplierId: sup, method: 'online', provider: 'payments_lk', status: 'confirmed', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR', createdAt: now, updatedAt: now });
  const mkRefund = async (status: string) => {
    const id = newId();
    await db.insert(schema.refunds).values({ id, paymentId: payId, purchaseOrderId: poId, amountCents: 1000, currency: 'LKR', status: status as any, source: 'manual', requestedByUserId: 'u-buyer', idempotencyKey: `rc-${status}`, createdAt: now, updatedAt: now });
    return id;
  };
  ids.biz = biz;
  ids.po = poId;
  ids.reqId = await mkRefund('requested');
  ids.appId = await mkRefund('approved');
  ids.procId = await mkRefund('processing');
}, 60000);

const buyerCtx = () => ({ userId: 'u-buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });
const otherCtx = () => ({ userId: 'u-other', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });
const adminCtx = () => ({ userId: 'u-admin', isAdmin: true, adminRole: 'finance', businesses: [], suppliers: [] });

describe('POST /api/refunds/:id/cancel', () => {
  it('lets the requester withdraw a requested refund', async () => {
    sessionCtx = buyerCtx();
    const res = await post(`/api/refunds/${ids.reqId}/cancel`, { reason: 'ordered by mistake' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ids.reqId, status: 'cancelled' });

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const row = (await db.select().from(schema.refunds).where(eq(schema.refunds.id, ids.reqId)).get()) as any;
    expect(row.status).toBe('cancelled');
    expect(row.cancellationReason).toBe('ordered by mistake');
  });

  it('rejects a different business user', async () => {
    sessionCtx = otherCtx();
    const res = await post(`/api/refunds/${ids.appId}/cancel`, {});
    expect(res.status).toBe(403);
  });

  it('rejects a requester trying to withdraw an approved refund', async () => {
    sessionCtx = buyerCtx();
    const res = await post(`/api/refunds/${ids.appId}/cancel`, {});
    expect(res.status).toBe(409);
  });

  it('lets an admin cancel an approved refund', async () => {
    sessionCtx = adminCtx();
    const res = await post(`/api/refunds/${ids.appId}/cancel`, { reason: 'superseded' });
    expect(res.status).toBe(200);
  });

  it('never cancels a processing refund', async () => {
    sessionCtx = adminCtx();
    const res = await post(`/api/refunds/${ids.procId}/cancel`, {});
    expect(res.status).toBe(409);
  });

  it('is 401 without a session', async () => {
    sessionCtx = null;
    const res = await post(`/api/refunds/${ids.procId}/cancel`, {});
    expect(res.status).toBe(401);
  });
});
