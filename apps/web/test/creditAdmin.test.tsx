import { describe, expect, it } from 'vitest';

describe('CreditAdmin', () => {
  it('money page module resolves', async () => {
    const m = await import('../src/admin/MoneyPage');
    expect(typeof m.MoneyPage).toBe('function');
  });
});
