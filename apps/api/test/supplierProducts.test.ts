import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

const offers: any[] = [];
const audits: any[] = [];
const members: any[] = [{ supplierId: 'sup-1', userId: 'u-owner', role: 'owner' }];
const suppliersRows: any[] = [{ id: 'sup-1', name: 'Acme' }];

vi.mock('../src/modules/supplierProducts/repository', () => ({
  listOffersForProduct: vi.fn(async (_d1, productId) => offers.filter((o) => o.productId === productId && !o.deletedAt)),
  listOffersForSupplier: vi.fn(async (_d1, supplierId) => offers.filter((o) => o.supplierId === supplierId && !o.deletedAt)),
  findOffer: vi.fn(async (_d1, id) => offers.find((o) => o.id === id && !o.deletedAt) ?? null),
  createOffer: vi.fn(async (_d1, input) => {
    const id = 'sp-' + (offers.length + 1);
    offers.push({ id, ...input, active: true, createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  }),
  updateOffer: vi.fn(async (_d1, id, input) => {
    const found = offers.find((o) => o.id === id);
    if (found) Object.assign(found, input, { updatedAt: Date.now() });
  }),
  softDeleteOffer: vi.fn(async (_d1, id) => {
    const found = offers.find((o) => o.id === id);
    if (found) { found.deletedAt = Date.now(); found.active = false; }
  }),
  recordAudit: vi.fn(async (_d1, entry) => {
    audits.push(entry);
  }),
}));

vi.mock('@vyro/db', () => ({
  getDb: (d1: D1Database) => ({
    select: () => ({
      from: (table: any) => ({
        where: (_c: any) => ({ get: async () => suppliersRows[0] ?? null }),
        get: async () => null,
        all: async () => [],
      }),
    }),
  }),
}));

vi.mock('@vyro/db/schema', () => ({
  suppliers: { name: 'suppliers' },
  supplierMembers: { name: 'supplier_members' },
  auditLogs: { name: 'audit_logs' },
}));

vi.mock('../src/modules/suppliers/service', () => ({
  supplierService: {
    requireMember: vi.fn(async (_d1, supplierId, userId) => {
      if (!members.find((m) => m.supplierId === supplierId && m.userId === userId)) {
        const { httpError } = await import('../src/lib/errors');
        throw httpError(403, 'FORBIDDEN', 'Not a member');
      }
    }),
  },
}));

let sessionCtx: any = null;
vi.mock('../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

vi.mock('../src/middleware/rbac', () => ({
  requireRole: (_opts: any) => async (c: any, next: any) => {
    const ctx = c.get('ctx');
    if (!ctx) return c.json({ code: 'UNAUTHORIZED', message: 'No session' }, 401);
    if (_opts?.admin && !ctx.isAdmin) return c.json({ code: 'FORBIDDEN', message: 'Admin only' }, 403);
    await next();
  },
}));

import app from '../src';

const D1_STUB: D1Database = {} as D1Database;

beforeEach(() => {
  offers.length = 0;
  audits.length = 0;
  members.length = 0;
  members.push({ supplierId: 'sup-1', userId: 'u-owner', role: 'owner' });
  suppliersRows.length = 0;
  suppliersRows.push({ id: 'sup-1', name: 'Acme' });
  sessionCtx = null;
});

describe('supplier products module', () => {
  it('GET /api/supplier-products/by-product/:id is public', async () => {
    const res = await app.request('/api/supplier-products/by-product/p1', { method: 'GET' }, { DB: D1_STUB, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).offers).toEqual([]);
  });

  it('POST without session is 401', async () => {
    const res = await app.request(
      '/api/supplier-products',
      { method: 'POST', body: JSON.stringify({ supplierId: 'sup-1', productId: 'p1', priceCents: 1000 }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(401);
  });

  it('POST as supplier member creates offer + audit row', async () => {
    sessionCtx = { userId: 'u-owner', memberships: [], isAdmin: false };
    const res = await app.request(
      '/api/supplier-products',
      { method: 'POST', body: JSON.stringify({ supplierId: 'sup-1', productId: 'p1', priceCents: 2500, minOrderQty: 5 }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(201);
    expect(offers[0].priceCents).toBe(2500);
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe('supplier_product.create');
  });

  it('POST as non-member is 403', async () => {
    sessionCtx = { userId: 'u-stranger', memberships: [], isAdmin: false };
    const res = await app.request(
      '/api/supplier-products',
      { method: 'POST', body: JSON.stringify({ supplierId: 'sup-1', productId: 'p1', priceCents: 100 }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(403);
  });

  it('PATCH updates price + writes audit', async () => {
    offers.push({ id: 'sp-1', supplierId: 'sup-1', productId: 'p1', priceCents: 100, active: true });
    sessionCtx = { userId: 'u-owner', memberships: [], isAdmin: false };
    const res = await app.request(
      '/api/supplier-products/sp-1',
      { method: 'PATCH', body: JSON.stringify({ priceCents: 200 }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(200);
    expect(offers[0].priceCents).toBe(200);
    expect(audits.find((a) => a.action === 'supplier_product.update')).toBeTruthy();
  });

  it('DELETE as member soft-deletes + audit', async () => {
    offers.push({ id: 'sp-1', supplierId: 'sup-1', productId: 'p1', priceCents: 100, active: true });
    sessionCtx = { userId: 'u-owner', memberships: [], isAdmin: false };
    const res = await app.request(
      '/api/supplier-products/sp-1',
      { method: 'DELETE' },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(200);
    expect(offers[0].deletedAt).toBeTruthy();
    expect(audits.find((a) => a.action === 'supplier_product.delete')).toBeTruthy();
  });

  it('PATCH requires membership check', async () => {
    offers.push({ id: 'sp-1', supplierId: 'sup-1', productId: 'p1', priceCents: 100, active: true });
    sessionCtx = { userId: 'u-stranger', memberships: [], isAdmin: false };
    const res = await app.request(
      '/api/supplier-products/sp-1',
      { method: 'PATCH', body: JSON.stringify({ priceCents: 9999 }) },
      { DB: D1_STUB, ENVIRONMENT: 'test' } as any,
    );
    expect(res.status).toBe(403);
    expect(offers[0].priceCents).toBe(100);
  });
});
