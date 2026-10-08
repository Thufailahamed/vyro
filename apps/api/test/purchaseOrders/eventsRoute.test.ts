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
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  ENVIRONMENT: 'test',
};
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
  const router = (await import('../../src/modules/purchaseOrders/routes')).default;
  app.route('/api/purchase-orders', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values({ id: 'u-buyer', email: 'buyer@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: 'PO-EVT-1', businessId: biz, supplierId: sup, status: 'pending', subtotalCents: 1000, deliveryFeeCents: 0, totalCents: 1000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-buyer', createdAt: now, updatedAt: now });
  await db.insert(schema.orderEvents).values([
    { id: newId(), purchaseOrderId: poId, actorUserId: null, fromStatus: null, toStatus: 'pending', reason: null, metadata: null, createdAt: now },
    { id: newId(), purchaseOrderId: poId, actorUserId: null, fromStatus: 'pending', toStatus: 'cancelled', reason: 'test', metadata: null, createdAt: now + 1 },
  ]);
  ids.biz = biz;
  ids.sup = sup;
  ids.po = poId;
}, 60000);

async function get(path: string) {
  return app.fetch(new Request(`http://localhost${path}`), env);
}

describe('GET /api/purchase-orders/:id/events (mounted route)', () => {
  it('is 404 for an unknown PO', async () => {
    sessionCtx = { userId: 'u-buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] };
    const res = await get('/api/purchase-orders/po-missing/events');
    expect(res.status).toBe(404);
  });

  it('returns the timeline for a participant', async () => {
    sessionCtx = { userId: 'u-buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] };
    const res = await get(`/api/purchase-orders/${ids.po}/events`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.events).toHaveLength(2);
    expect(body.events[0].toStatus).toBe('pending');
  });

  it('is 403 for a non-participant', async () => {
    sessionCtx = { userId: 'u-stranger', isAdmin: false, adminRole: null, businesses: [], suppliers: [] };
    const res = await get(`/api/purchase-orders/${ids.po}/events`);
    expect(res.status).toBe(403);
  });
});
