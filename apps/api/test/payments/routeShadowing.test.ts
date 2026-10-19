import { describe, expect, it, vi, beforeAll } from 'vitest';
import { makeD1, applyMigrations } from '../helpers/d1';

/**
 * Regression guard for the mount order in `src/index.ts`.
 *
 * `refundsRouter` exposes `GET /api/payments/:id` and `savedCardsRouter`
 * exposes `GET /api/payments/saved-cards/`. Hono matches routes in
 * registration order, so mounting the refunds router first makes
 * `GET /api/payments/saved-cards` resolve to the refund-by-id handler and
 * return `404 Refund not found` — the buyer's saved-cards panel never loads.
 *
 * This test drives the REAL app (not a hand-mounted router) so a future
 * reordering cannot silently break it again.
 */
const actor = vi.hoisted(() => ({ ctx: null as any }));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (!actor.ctx) throw new Error('savedCards routing: no ctx set');
    c.set('ctx', actor.ctx);
    await next();
  },
}));

const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  PRODUCTS: undefined,
  CACHE: undefined,
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
  ENVIRONMENT: 'test',
};

let app: any;
let businessId: string;

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();

  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  businessId = newId();
  await db.insert(schema.businesses).values({
    id: businessId,
    name: 'Buyer Ltd',
    businessTypeId: bt,
    contactPerson: 'B',
    phone: '077',
    email: 'b@t',
    address: '1',
    city: 'C',
    district: 'C',
    description: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  // Admin session — bypasses the business payment-role check.
  actor.ctx = { userId: 'u-admin', email: 'a@t', isAdmin: true, adminRole: 'super_admin', businesses: [], suppliers: [] };

  const { default: realApp } = await import('../../src/index');
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = realApp;
  app.onError((err: any, c: any) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
});

describe('payment route shadowing', () => {
  it('GET /api/payments/saved-cards reaches the saved-cards handler, not the refund-by-id handler', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/payments/saved-cards?businessId=${businessId}`),
      env,
    );
    const body: any = await res.json().catch(() => null);

    expect(res.status).toBe(200);
    expect(body?.error?.message).not.toBe('Refund not found');
    expect(Array.isArray(body?.cards)).toBe(true);
  });

  it('GET /api/payments/:id still resolves to the refund handler', async () => {
    const res = await app.fetch(new Request('http://localhost/api/payments/does-not-exist'), env);
    const body: any = await res.json().catch(() => null);
    // The refunds router owns `/:id`; an unknown id must be a refund 404.
    expect(res.status).toBe(404);
    expect(body?.error?.message).toBe('Refund not found');
  });
});
