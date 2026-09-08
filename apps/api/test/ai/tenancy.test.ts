import { describe, expect, it, vi, beforeEach } from 'vitest';

let activeRepos: any = {};

vi.mock('../../src/modules/ai/intents/drizzleRepos', () => ({
  drizzleRepos: () => activeRepos,
}));

import { orchestrate } from '../../src/modules/ai/orchestrator';
import { __resetCostCapForTests } from '../../src/modules/ai/guard';
import { mockRepos } from './helpers/aiFixture';

function makeEnv() {
  return {
    ENVIRONMENT: 'test',
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    AI: undefined,
    VYRO_AI_ENABLED: 'true',
    VYRO_AI_CLASSIFY_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    VYRO_AI_NARRATE_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    VYRO_AI_DAILY_TOKEN_CAP: '200000',
    DB: {} as any,
    METRICS: undefined,
  } as any;
}

beforeEach(() => {
  __resetCostCapForTests();
  activeRepos = {};
});

describe('cross-tenant isolation', () => {
  it('business A and business B see only their own spend figures', async () => {
    activeRepos = mockRepos({
      products: [],
      offers: [],
      pos: [{ id: 'poA', businessId: 'bA', supplierId: 'sA', status: 'delivered', totalCents: 100000, createdAt: Date.now() - 5 * 86400000 }],
      poItems: [],
    });
    const framesA: string[] = [];
    for await (const f of orchestrate(makeEnv(), {
      userId: 'uA', businessId: 'bA', businessName: 'Alpha',
      dict: { products: [], suppliers: [] },
    }, 'how much did I spend this month')) framesA.push(f);
    const aText = framesA.join('');

    activeRepos = mockRepos({
      products: [],
      offers: [],
      pos: [{ id: 'poB', businessId: 'bB', supplierId: 'sB', status: 'delivered', totalCents: 200000, createdAt: Date.now() - 5 * 86400000 }],
      poItems: [],
    });
    const framesB: string[] = [];
    for await (const f of orchestrate(makeEnv(), {
      userId: 'uB', businessId: 'bB', businessName: 'Bravo',
      dict: { products: [], suppliers: [] },
    }, 'spend this month please')) framesB.push(f);
    const bText = framesB.join('');

    expect(aText).toMatch(/100000/);
    expect(aText).not.toMatch(/200000/);
    expect(bText).toMatch(/200000/);
    expect(bText).not.toMatch(/100000/);
  });

  it('search returns only catalog products for the tenant context', async () => {
    activeRepos = mockRepos({
      products: [
        { id: 'p1', name: 'Samba Rice', categoryId: 'c1', unit: 'kg' },
        { id: 'p2', name: 'Secret Ingredient', categoryId: 'c9', unit: 'kg' },
      ],
      offers: [],
      pos: [],
      poItems: [],
    });
    const frames: string[] = [];
    for await (const f of orchestrate(makeEnv(), {
      userId: 'u1', businessId: 'b1', businessName: 'Acme',
      dict: { products: ['samba rice'], suppliers: [] },
    }, 'find samba rice')) frames.push(f);
    const text = frames.join('');
    expect(text).toMatch(/Samba Rice/);
    expect(text).not.toMatch(/Secret Ingredient/);
  });
});
