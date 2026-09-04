import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

const state = vi.hoisted(() => ({
  respond: [] as any[],
}));

const businessTypesRows = [
  { id: 'b1', slug: 'restaurant', name: 'Restaurant', sortOrder: 1, active: 1 },
  { id: 'b2', slug: 'hotel', name: 'Hotel', sortOrder: 2, active: 1 },
  { id: 'b3', slug: 'archived', name: 'Archived', sortOrder: 3, active: 0 },
];
const categoriesRows = [
  { id: 'c1', slug: 'office', name: 'Office', sortOrder: 1, active: 1, parentId: null },
  { id: 'c2', slug: 'child', name: 'Child', sortOrder: 2, active: 1, parentId: 'c1' },
  { id: 'c3', slug: 'archived', name: 'Archived', sortOrder: 3, active: 0, parentId: null },
];

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_table: any) => ({
        where: (_cond: any) => ({
          orderBy: (_o: any) => ({
            all: async () => state.respond.shift() ?? [],
          }),
        }),
      }),
    }),
  }),
}));

import businessTypesRouter from '../src/modules/businessTypes/routes';
import supplierTypesRouter from '../src/modules/supplierTypes/routes';

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
  ENVIRONMENT: 'test',
} as any;

describe('type catalogue endpoints', () => {
  beforeEach(() => {
    state.respond = [];
  });

  it('GET /businesses/types excludes inactive', async () => {
    state.respond = [businessTypesRows.filter((r) => r.active === 1)];
    const res = await businessTypesRouter.fetch(new Request('http://localhost/types'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.types.map((t: any) => t.slug)).toEqual(['restaurant', 'hotel']);
  });

  it('GET /suppliers/types returns root categories only', async () => {
    state.respond = [categoriesRows.filter((r) => r.active === 1 && r.parentId === null)];
    const res = await supplierTypesRouter.fetch(new Request('http://localhost/types'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.types.map((t: any) => t.slug)).toEqual(['office']);
  });
});
