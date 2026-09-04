import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

vi.mock('../src/middleware/session', () => ({
  session: () => async (_c: any, next: any) => next(),
  Ctx: {},
}));
vi.mock('../src/middleware/rbac', () => ({
  requireRole: (_opts: any) => async (_c: any, next: any) => next(),
}));

// Stub @vyro/db with a no-op so we only exercise validation + path mounting.
vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => ({ all: () => [] }), all: () => [], get: () => null }),
      }),
    }),
  }),
}));

import app from '../src';

describe('search module validation', () => {
  it('rejects missing q', async () => {
    const res = await app.request('/api/search/products', { method: 'GET' }, { DB: {} as D1Database, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(400);
  });

  it('rejects limit > 50', async () => {
    const res = await app.request('/api/search/products?q=rice&limit=999', { method: 'GET' }, { DB: {} as D1Database, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(400);
  });

  it('accepts valid query and returns shape', async () => {
    const res = await app.request('/api/search/products?q=rice', { method: 'GET' }, { DB: {} as D1Database, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.hits)).toBe(true);
    expect(body.nextCursor === null || typeof body.nextCursor === 'string').toBe(true);
  });
});
