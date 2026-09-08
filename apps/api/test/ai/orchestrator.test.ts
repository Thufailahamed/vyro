import { describe, expect, it } from 'vitest';
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

describe('orchestrate (heuristic fallback, no AI binding)', () => {
  it('emits full SSE sequence for find_cheapest', async () => {
    __resetCostCapForTests();
    // intercept drizzleRepos call site by mocking the factory in this test scope
    vi.resetModules();
    vi.doMock('../../src/modules/ai/intents/drizzleRepos', () => ({
      drizzleRepos: () => mockRepos({
        products: [{ id: 'p1', name: 'Samba Rice', categoryId: 'c1', unit: 'kg' }],
        offers: [
          { id: 'o1', supplierId: 's1', productId: 'p1', priceCents: 500000, minOrderQty: 1, leadTimeDays: 1, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's1', name: 'Alpha' } },
          { id: 'o2', supplierId: 's2', productId: 'p1', priceCents: 450000, minOrderQty: 1, leadTimeDays: 1, deliveryAvailable: true, availabilityStatus: 'in_stock', active: true, supplier: { id: 's2', name: 'Beta' } },
        ],
      }),
    }));
    const { orchestrate: orchestrateIsolated } = await import('../../src/modules/ai/orchestrator');

    const frames: string[] = [];
    for await (const f of orchestrateIsolated(
      makeEnv(),
      { userId: 'u1', businessId: 'b1', businessName: 'Acme', dict: { products: ['samba rice'], suppliers: [] } },
      'cheapest samba rice',
    )) frames.push(f);

    const joined = frames.join('');
    expect(joined).toMatch(/event: status/);
    expect(joined).toMatch(/event: tool_call/);
    expect(joined).toMatch(/event: tool_result/);
    expect(joined).toMatch(/recommendation_card/);
    expect(joined).toMatch(/event: final/);
  });

  it('returns clarification card for gibberish input', async () => {
    __resetCostCapForTests();
    vi.resetModules();
    vi.doMock('../../src/modules/ai/intents/drizzleRepos', () => ({
      drizzleRepos: () => mockRepos({ products: [], offers: [] }),
    }));
    const { orchestrate: orchestrateIsolated } = await import('../../src/modules/ai/orchestrator');
    const frames: string[] = [];
    for await (const f of orchestrateIsolated(
      makeEnv(),
      { userId: 'u1', businessId: 'b1', businessName: 'Acme', dict: { products: [], suppliers: [] } },
      'asdf qwerty 123',
    )) frames.push(f);
    const joined = frames.join('');
    expect(joined).toMatch(/clarification_card/);
  });
});

// Vitest imports
import { vi } from 'vitest';
