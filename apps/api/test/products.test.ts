import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

let store: any[] = [];
let images: any[] = [];

vi.mock('../src/modules/products/repository', () => ({
  listProducts: vi.fn(async (_d1, opts) => store.filter((p) => !p.deletedAt).filter((p) => !opts?.categoryId || p.categoryId === opts.categoryId).slice(0, opts?.limit ?? 50)),
  findProductById: vi.fn(async (_d1, id) => store.find((p) => p.id === id && !p.deletedAt) ?? null),
  findCategoryById: vi.fn(async (_d1, id) => id === 'cat-1' ? { id: 'cat-1', name: 'Cat1' } : null),
  createProduct: vi.fn(async (_d1, input) => {
    const id = 'p-' + (store.length + 1);
    store.push({ id, ...input, active: true, deletedAt: null, createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  }),
  updateProduct: vi.fn(async (_d1, id, input) => {
    const found = store.find((p) => p.id === id);
    if (found) Object.assign(found, input, { updatedAt: Date.now() });
  }),
  softDeleteProduct: vi.fn(async (_d1, id) => {
    const found = store.find((p) => p.id === id);
    if (found) { found.deletedAt = Date.now(); found.active = false; }
  }),
  listProductImages: vi.fn(async (_d1, productId) => images.filter((i) => i.productId === productId)),
  addProductImage: vi.fn(async (_d1, productId, input) => {
    const id = 'img-' + (images.length + 1);
    images.push({ id, productId, ...input });
    return id;
  }),
  removeProductImage: vi.fn(async (_d1, imageId) => {
    images = images.filter((i) => i.id !== imageId);
  }),
}));

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

import app from '../src';

const R2_PUT = vi.fn().mockResolvedValue(undefined);
const D1_STUB: D1Database = {} as D1Database;

beforeEach(() => {
  store = [];
  images = [];
  sessionCtx = null;
  R2_PUT.mockClear();
});

const env = (extra: any = {}) => ({ DB: D1_STUB, ENVIRONMENT: 'test', PRODUCTS: { put: R2_PUT, get: vi.fn() }, ...extra });

describe('products module', () => {
  it('GET /api/products is public', async () => {
    const res = await app.request('/api/products', { method: 'GET' }, env() as any);
    expect(res.status).toBe(200);
  });

  it('POST /api/products as admin creates', async () => {
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const res = await app.request(
      '/api/products',
      { method: 'POST', body: JSON.stringify({ name: 'Rice 5kg', categoryId: 'cat-1', unit: 'bag' }) },
      env() as any,
    );
    expect(res.status).toBe(201);
    expect(store[0].name).toBe('Rice 5kg');
  });

  it('POST rejects unknown categoryId reference', async () => {
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const res = await app.request(
      '/api/products',
      { method: 'POST', body: JSON.stringify({ name: 'X', categoryId: 'ghost', unit: 'kg' }) },
      env() as any,
    );
    expect(res.status).toBe(400);
  });

  it('POST /api/products without admin returns 403', async () => {
    sessionCtx = { userId: 'u1', memberships: [], isAdmin: false };
    const res = await app.request(
      '/api/products',
      { method: 'POST', body: JSON.stringify({ name: 'X', categoryId: 'cat-1', unit: 'kg' }) },
      env() as any,
    );
    expect(res.status).toBe(403);
  });

  it('PATCH /api/products/:id updates name', async () => {
    store.push({ id: 'p1', name: 'Old', categoryId: 'cat-1', unit: 'kg', active: true, deletedAt: null });
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const res = await app.request(
      '/api/products/p1',
      { method: 'PATCH', body: JSON.stringify({ name: 'New' }) },
      env() as any,
    );
    expect(res.status).toBe(200);
    expect(store[0].name).toBe('New');
  });

  it('DELETE /api/products/:id soft-deletes', async () => {
    store.push({ id: 'p1', name: 'X', categoryId: 'cat-1', unit: 'kg', active: true, deletedAt: null });
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const res = await app.request('/api/products/p1', { method: 'DELETE' }, env() as any);
    expect(res.status).toBe(200);
    expect(store[0].deletedAt).toBeTruthy();
  });

  it('POST /api/products/:id/images uploads to R2 + records row', async () => {
    store.push({ id: 'p1', name: 'X', categoryId: 'cat-1', unit: 'kg', active: true, deletedAt: null });
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const base64 = Buffer.from('fake-png-bytes').toString('base64');
    const res = await app.request(
      '/api/products/p1/images',
      { method: 'POST', body: JSON.stringify({ filename: 'a.png', contentType: 'image/png', base64 }) },
      env() as any,
    );
    expect(res.status).toBe(201);
    expect(R2_PUT).toHaveBeenCalledTimes(1);
    expect(images[0].r2Key).toMatch(/^products\/p1\//);
  });

  it('rejects non-image content type', async () => {
    store.push({ id: 'p1', name: 'X', categoryId: 'cat-1', unit: 'kg', active: true, deletedAt: null });
    sessionCtx = { userId: 'admin1', memberships: [], isAdmin: true };
    const res = await app.request(
      '/api/products/p1/images',
      { method: 'POST', body: JSON.stringify({ filename: 'a.txt', contentType: 'text/plain', base64: 'YWE=' }) },
      env() as any,
    );
    expect(res.status).toBe(400);
  });
});
