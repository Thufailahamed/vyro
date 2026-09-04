import { describe, it, expect } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';

const env: Env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  AUDIT_QUEUE: {} as Queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
};

/**
 * Phase 1-3 only: these tests exercise auth middleware behavior without
 * touching D1. Full D1-backed tenancy isolation tests arrive in Phase 4 when
 * we wire @cloudflare/vitest-pool-workers and forge real sessions via
 * helpers/auth.ts (TODO-AUTHHELPERS).
 *
 * For now we assert: unauthenticated reads of tenant-scoped routes are
 * rejected with 401, never leaking whether the resource exists.
 */
describe('tenant routes reject anonymous requests', () => {
  it('GET /api/businesses/me returns 401 without session', async () => {
    const res = await app.request('/api/businesses/me', {}, env);
    expect(res.status).toBe(401);
  });

  it('GET /api/businesses/:id returns 401 without session', async () => {
    const res = await app.request('/api/businesses/00000000-0000-0000-0000-000000000000', {}, env);
    expect(res.status).toBe(401);
  });

  it('POST /api/businesses returns 401 without session', async () => {
    const res = await app.request(
      '/api/businesses',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Acme',
          businessTypeSlug: 'restaurant',
          contactPerson: 'A',
          phone: '0771234567',
          email: 'a@example.com',
          address: '1',
          city: 'Colombo',
          district: 'Colombo',
        }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/suppliers/me returns 401 without session', async () => {
    const res = await app.request('/api/suppliers/me', {}, env);
    expect(res.status).toBe(401);
  });

  it.skip('GET /api/suppliers/:id returns 404 when no row found (TODO-AUTHHELPERS)', async () => {
    // Requires @cloudflare/vitest-pool-workers (Phase 4) so the public-read
    // path can hit a real D1. With stub DB, drizzle throws because
    // `client.prepare` is not a function, which surfaces as 500. The route
    // itself returns 404 on a real empty D1.
    const res = await app.request(
      '/api/suppliers/00000000-0000-0000-0000-000000000000',
      {},
      env,
    );
    expect(res.status).toBe(404);
  });
});
