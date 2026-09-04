import { describe, it, expect } from 'vitest';
import { formatLKR, lkrToCents, sumCents } from './money';

describe('money', () => {
  it('formats cents as LKR without decimals', () => {
    expect(formatLKR(750000)).toMatch(/Rs\.?\s?7,500|LKR\s?7,500/);
  });
  it('rounds rupees to cents', () => {
    expect(lkrToCents(7.5)).toBe(750);
    expect(lkrToCents(7.555)).toBe(756);
  });
  it('sums integer cents without floating drift', () => {
    expect(sumCents([100, 200, 300])).toBe(600);
    expect(sumCents([33, 33, 34])).toBe(100);
  });
});
