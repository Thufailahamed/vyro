import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: {
    WEB_ORIGIN: 'x',
    ADMIN_ORIGIN: 'x',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'x',
    ENVIRONMENT: 'test',
  },
}));

const state = vi.hoisted(() => ({
  products: [] as any[],
  suppliers: [] as any[],
  supDistricts: [] as string[],
  bizDistricts: [] as string[],
  gmv: 0,
  supCount: 0,
  bizCount: 0,
}));

const tableTags = vi.hoisted(() => {
  const tag = (name: string) => ({
    __table: name,
    id: 'id',
    district: 'district',
    status: 'status',
    totalCents: 'totalCents',
    createdAt: 'createdAt',
  });
  return {
    suppliers: tag('suppliers'),
    products: tag('products'),
    businesses: tag('businesses'),
    purchaseOrders: tag('purchaseOrders'),
  };
});

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: (cols?: any) => ({
      from: (t: any) => {
        const keys = cols ? Object.keys(cols) : [];
        const all = async () => {
          if (t?.__table === 'products') return state.products;
          if (t?.__table === 'suppliers' && keys.length === 0) return state.suppliers;
          if (t?.__table === 'suppliers' && keys.includes('district'))
            return state.supDistricts.map((d) => ({ district: d }));
          if (t?.__table === 'businesses' && keys.includes('district'))
            return state.bizDistricts.map((d) => ({ district: d }));
          if (t?.__table === 'purchaseOrders' && keys.includes('total')) return [{ total: state.gmv }];
          if (t?.__table === 'suppliers' && keys.includes('n')) return [{ n: state.supCount }];
          if (t?.__table === 'businesses' && keys.includes('n')) return [{ n: state.bizCount }];
          return [];
        };
        const chain: any = {
          where: () => chain,
          groupBy: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          all,
        };
        return chain;
      },
    }),
  }),
}));

vi.mock('@vyro/db/schema', () => ({
  suppliers: tableTags.suppliers,
  products: tableTags.products,
  businesses: tableTags.businesses,
  purchaseOrders: tableTags.purchaseOrders,
}));

import homeRouter, { __resetTrustStatsCache } from '../src/modules/home/routes';
import { errorEnvelope } from '../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/home', homeRouter);
  return app;
}

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'x',
  ADMIN_ORIGIN: 'x',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'x',
  ENVIRONMENT: 'test',
} as any;

describe('GET /api/home/feed', () => {
  beforeEach(() => {
    __resetTrustStatsCache();
    state.products = [];
    state.suppliers = [];
    state.supDistricts = [];
    state.bizDistricts = [];
    state.gmv = 0;
    state.supCount = 0;
    state.bizCount = 0;
  });

  it('returns empty defaults when DB sparse', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/home/feed'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.featuredProducts).toEqual([]);
    expect(body.verifiedSuppliers).toEqual([]);
    expect(body.trustStats).toBeDefined();
    expect(Array.isArray(body.journeySteps)).toBe(true);
    expect(Array.isArray(body.faq)).toBe(true);
  });

  it('returns live trust stats, not hardcoded constants', async () => {
    state.suppliers = [{ id: 's-1' }];
    state.supDistricts = ['Colombo', 'Kandy'];
    state.bizDistricts = ['Kandy', 'Galle'];
    state.gmv = 250000;
    state.supCount = 12;
    state.bizCount = 30;
    const res = await buildApp().fetch(new Request('http://localhost/api/home/feed'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.trustStats).toEqual({
      districtsCovered: 3,
      lifetimeGmvCents: 250000,
      activeBusinesses: 30,
      activeSuppliers: 12,
    });
  });
});
