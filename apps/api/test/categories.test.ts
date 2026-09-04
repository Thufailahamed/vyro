import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

// Stub repository layer with in-memory state so we test routes wiring + auth.
let store: any[] = [];
vi.mock('../src/modules/categories/repository', () => ({
  listCategories: vi.fn(async () => store),
  findCategoryById: vi.fn(async (_d1: D1Database, id: string) => store.find((c) => c.id === id) ?? null),
  createCategory: vi.fn(async (_d1: D1Database, input: any) => {
    const id = 'cat-' + (store.length + 1);
    store.push({ id, ...input, active: true });
    return id;
  }),
  updateCategory: vi.fn(async (_d1: D1Database, id: string, input: any) => {
    const found = store.find((c) => c.id === id);
    if (found) Object.assign(found, input);
  }),
}));

// Stub session + rbac to bypass real better-auth in unit test.
let sessionCtx: any = null;
vi.mock('../src/middleware/session', () => ({
  session: () => async (_c: any, next: any) => {
    if (sessionCtx) _c.set('session', sessionCtx);
    await next();
  },
  Ctx: {},
}));

vi.mock('../src/middleware/rbac', () => ({
  requireRole: (_opts: any) => async (c: any, next: any) => {
    const ctx = c.get('session');
    if (!ctx) return c.json({ code: 'UNAUTHORIZED', message: 'No session' }, 401);
    if (_opts?.admin && !ctx.isAdmin) return c.json({ code: 'FORBIDDEN', message: 'Admin only' }, 403);
    await next();
  },
}));

import app from '../src/index';

const D1_STUB: D1Database = {} as D1Database;

beforeEach(() => {
  store = [];
  sessionCtx = null;
});

describe('categories module', () => {
  it('GET /api/categories is public', async () => {
    const res = await app.request('/api/categories', { method: 'GET' }, { DB: D1_STUB, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.categories)).toBe(true);
  });

  it('POST /api/categories without session returns 401', async () => {
    const res = await app.request(
      '/api/categories',
      { method: 'POST', body: JSON.stringify({ slug: 'a', name: 'A' }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/categories as non-admin returns 403', async () => {
    sessionCtx = { userId: 'u1', memberships: [], isAdmin: false };
    const res = await app.request(
      '/api/categories',
      { method: 'POST', body: JSON.stringify({ slug: 'a', name: 'A' }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(403);
  });

  it('POST /api/categories as admin creates', async () => {
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const res = await app.request(
      '/api/categories',
      { method: 'POST', body: JSON.stringify({ slug: 'food', name: 'Food' }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(store[0].slug).toBe('food');
  });

  it('PATCH /api/categories/:id updates name', async () => {
    store.push({ id: 'c1', slug: 'food', name: 'Food', active: true });
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const res = await app.request(
      '/api/categories/c1',
      { method: 'PATCH', body: JSON.stringify({ name: 'Food & Beverage' }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(200);
    expect(store[0].name).toBe('Food & Beverage');
  });

  it('rejects unknown body keys via strict schema', async () => {
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const res = await app.request(
      '/api/categories',
      { method: 'POST', body: JSON.stringify({ slug: 'food', name: 'Food', evil: true }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(400);
  });
});
