import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u1', isAdmin: true });
    await next();
  },
}));

describe('credit e2e', () => {
  it('rejects limit below used with credit_limit_below_used', async () => {
    const { assertLimitChange } = await import('../../src/modules/credit/service');
    await expect(async () => assertLimitChange({ usedCents: 100 }, 50)).rejects.toMatchObject({ code: 'credit_limit_below_used' });
  });
});
