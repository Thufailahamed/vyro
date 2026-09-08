import { describe, it, expect, vi } from 'vitest';

describe('assertDailyBudget', () => {
  it('throws when usage >= cap', async () => {
    vi.doMock('../../../src/modules/ai/cost', () => ({
      dailyBudgetUsage: async () => ({ costUsd: 6, tokensIn: 0, tokensOut: 0, day: 'x' }),
    }));
    const { assertDailyBudget } = await import('../../../src/modules/ai/guard');
    await expect(assertDailyBudget({ DB: {} } as any, 'biz-1')).rejects.toThrow(/exceeded/i);
    vi.doUnmock('../../../src/modules/ai/cost');
  });

  it('returns warn=true at 80%', async () => {
    vi.doMock('../../../src/modules/ai/cost', () => ({
      dailyBudgetUsage: async () => ({ costUsd: 4.2, tokensIn: 0, tokensOut: 0, day: 'x' }),
    }));
    const { assertDailyBudget } = await import('../../../src/modules/ai/guard');
    const r = await assertDailyBudget({ DB: {} } as any, 'biz-1', { budgetUsd: 5 });
    expect(r.warn).toBe(true);
    expect(r.usageUsd).toBe(4.2);
    expect(r.budgetUsd).toBe(5);
    vi.doUnmock('../../../src/modules/ai/cost');
  });

  it('returns warn=false below 80%', async () => {
    vi.doMock('../../../src/modules/ai/cost', () => ({
      dailyBudgetUsage: async () => ({ costUsd: 1.0, tokensIn: 0, tokensOut: 0, day: 'x' }),
    }));
    const { assertDailyBudget } = await import('../../../src/modules/ai/guard');
    const r = await assertDailyBudget({ DB: {} } as any, 'biz-1', { budgetUsd: 5 });
    expect(r.warn).toBe(false);
    vi.doUnmock('../../../src/modules/ai/cost');
  });

  it('honours a per-call budget override', async () => {
    vi.doMock('../../../src/modules/ai/cost', () => ({
      dailyBudgetUsage: async () => ({ costUsd: 1.5, tokensIn: 0, tokensOut: 0, day: 'x' }),
    }));
    const { assertDailyBudget } = await import('../../../src/modules/ai/guard');
    await expect(
      assertDailyBudget({ DB: {} } as any, 'biz-1', { budgetUsd: 1 }),
    ).rejects.toThrow(/exceeded/i);
    vi.doUnmock('../../../src/modules/ai/cost');
  });
});
