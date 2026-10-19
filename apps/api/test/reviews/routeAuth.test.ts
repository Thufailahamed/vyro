import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

/**
 * Route-level auth contract for the reviews module.
 *
 * Every mutating review endpoint must reject anonymous callers with 401
 * BEFORE touching D1, and admin-only endpoints must reject authenticated
 * non-admins with 403. The static RBAC audit (src/scripts/rbac-audit.ts)
 * can only see `session()` / `requireRole()` / `requirePermission()` — these
 * behavioural tests are the safety net that keeps the guard real.
 */

const state = vi.hoisted(() => ({
  ctx: null as null | Record<string, unknown>,
}));

vi.mock('../../src/middleware/session', async () => {
  const { httpError } = await import('../../src/lib/errors');
  return {
    session: () => async (c: any, next: any) => {
      if (!state.ctx) throw httpError(401, 'UNAUTHORIZED', 'No active session');
      c.set('ctx', state.ctx);
      await next();
    },
  };
});

// Feature-flag lookup would hit D1; the reviews flag defaults to ON.
vi.mock('../../src/modules/admin/platform/configSectionsService', async () => {
  const { httpError } = await import('../../src/lib/errors');
  return {
    read: async (_d1: unknown, section: string) => {
      if (section === 'feature_flags') {
        return { section, value: { REVIEWS_ENABLED: true }, version: 1 };
      }
      throw httpError(404, 'NOT_FOUND', `Unknown section ${section}`);
    },
    update: async () => {
      throw httpError(404, 'NOT_FOUND', 'not used');
    },
  };
});

// Only the public read path touches the repository in these tests.
vi.mock('../../src/modules/reviews/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/modules/reviews/repository')>()),
  listReviews: async () => [],
  findRepliesByReviewIds: async () => [],
  findImagesByReviewIds: async () => [],
  aggregateForSupplier: async () => ({
    count: 0,
    avg: null,
    lastReviewAt: null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  }),
}));

import reviewsRouter from '../../src/modules/reviews/routes';
import { errorEnvelope } from '../../src/lib/errors';

function app() {
  const a = new Hono();
  a.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  a.route('/api', reviewsRouter);
  return a;
}

/** Minimal D1/R2 stand-ins — the auth assertions never reach the database. */
const ENV = { DB: {} as any, CACHE: undefined as any, PRODUCTS: {} as any };

function req(path: string, init?: RequestInit) {
  return app().request(path, init, ENV as any);
}

const ANON = { label: 'anonymous', path: '/api', body: undefined as unknown };

/** Every mutating endpoint in the reviews module. */
const MUTATING_ENDPOINTS: { label: string; method: 'post' | 'patch' | 'delete'; path: string; body?: unknown }[] = [
  { label: 'POST /reviews', method: 'post', path: '/api/reviews', body: {} },
  {
    label: 'POST /suppliers/:id/reviews/:reviewId/reply',
    method: 'post',
    path: '/api/suppliers/s1/reviews/r1/reply',
    body: {},
  },
  {
    label: 'PATCH /suppliers/:id/reviews/:reviewId/flag',
    method: 'patch',
    path: '/api/suppliers/s1/reviews/r1/flag',
    body: {},
  },
  {
    label: 'POST /admin/reviews/flags/:flagId/resolve',
    method: 'post',
    path: '/api/admin/reviews/flags/f1/resolve',
    body: {},
  },
  { label: 'DELETE /admin/reviews/:reviewId', method: 'delete', path: '/api/admin/reviews/r1' },
  { label: 'PATCH /reviews/:id', method: 'patch', path: '/api/reviews/r1', body: {} },
  { label: 'DELETE /reviews/:id', method: 'delete', path: '/api/reviews/r1' },
  { label: 'POST /reviews/:id/helpful', method: 'post', path: '/api/reviews/r1/helpful' },
  { label: 'DELETE /reviews/:id/helpful', method: 'delete', path: '/api/reviews/r1/helpful' },
  {
    label: 'POST /reviews/images/upload-direct',
    method: 'post',
    path: '/api/reviews/images/upload-direct',
  },
];

describe('reviews route auth', () => {
  beforeEach(() => {
    state.ctx = null;
  });

  for (const ep of MUTATING_ENDPOINTS) {
    it(`${ep.label} rejects anonymous callers with 401`, async () => {
      const res = await req(ep.path, {
        method: ep.method.toUpperCase(),
        headers: { 'content-type': 'application/json' },
        ...(ep.body === undefined ? {} : { body: JSON.stringify(ep.body) }),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  }

  it('keeps the public review list readable without a session', async () => {
    const res = await req('/api/suppliers/s1/reviews');
    expect(res.status).toBe(200);
  });

  it('keeps the public review summary readable without a session', async () => {
    const res = await req('/api/suppliers/s1/review-summary');
    expect(res.status).toBe(200);
  });

  it('blocks a non-admin from resolving a review flag with 403', async () => {
    state.ctx = {
      userId: 'u-buyer',
      email: 'buyer@x.example',
      isAdmin: false,
      adminRole: null,
      businesses: [{ businessId: 'b1' }],
      suppliers: [],
    };
    const res = await req('/api/admin/reviews/flags/f1/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'keep' }),
    });
    expect(res.status).toBe(403);
  });

  it('blocks a non-owner supplier from replying to a review with 403', async () => {
    state.ctx = {
      userId: 'u-supplier',
      email: 'sup@x.example',
      isAdmin: false,
      adminRole: null,
      businesses: [],
      suppliers: [{ supplierId: 's-other' }],
    };
    const res = await req('/api/suppliers/s1/reviews/r1/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'thanks' }),
    });
    expect(res.status).toBe(403);
  });
});
