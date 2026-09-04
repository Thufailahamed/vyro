import { describe, expect, it } from 'vitest';
import { formatLKR } from '../src/lib/format';

describe('formatLKR', () => {
  it('formats cents to LKR string', () => {
    expect(formatLKR(100000)).toContain('1,000.00');
    expect(formatLKR(0)).toContain('0.00');
  });
});
