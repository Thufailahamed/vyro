import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  supplier: null as any,
  members: [] as any[],
  offers: [] as any[],
  pos: [] as any[],
  allQueue: [] as any[][],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.supplier,
          all: async () => state.allQueue.shift() ?? [],
        }),
        innerJoin: (_t2: any) => ({
          where: (_c: any) => ({
            all: async () => state.members,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock(setup.SRC + '/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => { await next(); },
}));

import supplierDetailRouter from '../../src/modules/admin/supplierDetail';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin', supplierDetailRouter);
  return app;
}

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('GET /api/admin/suppliers/:id', () => {
  beforeEach(() => {
    state.supplier = null;
    state.members = [];
    state.offers = [];
    state.pos = [];
    state.allQueue = [];
  });

  it('404 when supplier not found', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers/sup-1'), env);
    expect(res.status).toBe(404);
  });

  it('200 with members when found', async () => {
    state.supplier = { id: 'sup-1', name: 'Acme', description: null, status: 'active', createdAt: 1000 };
    state.members = [
      { userId: 'u-1', role: 'owner', email: 'a@b.com' },
      { userId: 'u-2', role: 'manager', email: 'c@d.com' },
    ];
    state.offers = [{ c: 'o-1' }];
    state.pos = [{ c: 'po-1' }, { c: 'po-2' }];
    state.allQueue = [state.offers, state.pos];
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers/sup-1'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.supplier.name).toBe('Acme');
    expect(body.supplier.members).toHaveLength(2);
    expect(body.supplier.members[0].email).toBe('a@b.com');
    expect(body.supplier.offerCount).toBe(1);
    expect(body.supplier.activePoCount).toBe(2);
  });
});
