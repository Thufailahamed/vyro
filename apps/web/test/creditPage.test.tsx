import { describe, expect, it } from 'vitest';

describe('CreditPage', () => {
  it('module resolves', async () => {
    const m = await import('../src/pages/CreditPage');
    expect(typeof m.CreditPage).toBe('function');
  });
});
