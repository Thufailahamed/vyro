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
  const router = (await import('../../src/modules/deliveries/routes')).default;
  app.route('/api/deliveries', router);

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
  await db.insert(schema.supplierMembers).values({ id: newId(), supplierId: sup, userId: 'sup-u', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const mkPo = async (n: number) => {
    const poId = newId();
    await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: `PO-DEL-${n}`, businessId: biz, supplierId: sup, status: 'pending', subtotalCents: 1000, deliveryFeeCents: 0, totalCents: 1000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'buyer', createdAt: now, updatedAt: now });
    return poId;
  };
  ids.biz = biz;
  ids.sup = sup;
  ids.po1 = await mkPo(1);
  ids.po2 = await mkPo(2);
}, 60000);

const supplier = () => ({ userId: 'sup-u', isAdmin: false, adminRole: null, businesses: [], suppliers: [] });

describe('POST /api/deliveries/:poId/transitions idempotency', () => {
  it('replays the stored response and writes one delivery event', async () => {
    sessionCtx = supplier();
    const key = 'idem-delivery-replay';
    const body = { status: 'assigned', driverName: 'Kamal' };
    const r1 = await post(`/api/deliveries/${ids.po1}/transitions`, body, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true });

    const r2 = await post(`/api/deliveries/${ids.po1}/transitions`, body, { 'Idempotency-Key': key });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ ok: true });

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const events = (await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.purchaseOrderId, ids.po1)).all()) as any[];
    const deliveryEvents = events.filter((e) => {
      try {
        return JSON.parse(e.metadata ?? '{}').kind === 'delivery';
      } catch {
        return false;
      }
    });
    expect(deliveryEvents).toHaveLength(1);
  });

  it('rejects key reuse with a different payload', async () => {
    sessionCtx = supplier();
    const key = 'idem-delivery-mismatch';
    const r1 = await post(`/api/deliveries/${ids.po2}/transitions`, { status: 'assigned', driverName: 'Kamal' }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);

    const r2 = await post(`/api/deliveries/${ids.po2}/transitions`, { status: 'failed', reason: 'no answer' }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(409);
  });

  it('leaves keyless callers unchanged', async () => {
    sessionCtx = supplier();
    const res = await post(`/api/deliveries/${ids.po1}/transitions`, { status: 'assigned', driverName: 'Kamal' });
    expect(res.status).toBe(409);
  });

  it('is 401 without a session', async () => {
    sessionCtx = null;
    const res = await post(`/api/deliveries/${ids.po1}/transitions`, { status: 'assigned' });
    expect(res.status).toBe(401);
  });
});
