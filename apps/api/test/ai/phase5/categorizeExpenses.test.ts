import { describe, it, expect } from 'vitest';
import { categorizeExpensesHandler } from '../../../src/modules/ai/intents/categorizeExpenses';

const repos = {
  expenseCategoryBreakdown: async (_b: string, _m: number) => [
    { slug: 'food', total: 240000 },
    { slug: 'packaging', total: 80000 },
    { slug: 'other', total: 60000 },
  ],
};

const baseCtx: any = {
  env: {},
  businessId: 'biz-1',
  userId: 'u-1',
  classify: { intent: 'categorize_expenses', slots: {} },
};

describe('categorizeExpensesHandler', () => {
  it('renders spend_summary_card with totals + percent', async () => {
    const out = await categorizeExpensesHandler(baseCtx, repos as any);
    expect(out.components[0]!.type).toBe('spend_summary_card');
    expect(out.rawSummary.byCategory).toHaveLength(3);
    expect((out.rawSummary as any).byCategory[0].slug).toBe('food');
  });

  it('returns clarification when no rows exist', async () => {
    const empty = { expenseCategoryBreakdown: async () => [] };
    const out = await categorizeExpensesHandler(baseCtx, empty as any);
    expect(out.components[0]!.type).toBe('clarification_card');
  });

  it('clamps months slot to 1..12', async () => {
    const ctx = { ...baseCtx, classify: { ...baseCtx.classify, slots: { months: 99 } } };
    const out = await categorizeExpensesHandler(ctx, repos as any);
    expect((out.rawSummary as any).months).toBe(12);
  });

  it('defaults months to 1 when missing', async () => {
    const out = await categorizeExpensesHandler(baseCtx, repos as any);
    expect((out.rawSummary as any).months).toBe(1);
  });
});
