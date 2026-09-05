import { describe, expect, it, vi } from 'vitest';
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

const state = vi.hoisted(() => ({ products: [] as any[], suppliers: [] as any[] }));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => {
        const chain: any = {
          where: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          all: async () => state.products,
        };
        return chain;
      },
    }),
  }),
  suppliers: { id: 'id' },
  products: { id: 'id' },
}));

import homeRouter from '../src/modules/home/routes';
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
  it('returns empty defaults when DB sparse', async () => {
    state.products = [];
    state.suppliers = [];
    const res = await buildApp().fetch(new Request('http://localhost/api/home/feed'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.featuredProducts).toEqual([]);
    expect(body.verifiedSuppliers).toEqual([]);
    expect(body.trustStats).toBeDefined();
    expect(Array.isArray(body.journeySteps)).toBe(true);
    expect(Array.isArray(body.faq)).toBe(true);
  });
});
