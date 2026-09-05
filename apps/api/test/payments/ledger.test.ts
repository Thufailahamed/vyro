import { describe, expect, it } from 'vitest';
import { computePlatformFeeCents } from '../../src/modules/payments/fees';

describe('platform fee math', () => {
  it('returns 0 for 0 amount', () => {
    expect(computePlatformFeeCents(0, 250)).toBe(0);
  });

  it('rounds half-up at boundary', () => {
    // 10001 cents * 250 / 10000 = 250.025 → 250
    expect(computePlatformFeeCents(10001, 250)).toBe(250);
    // 10005 * 250 / 10000 = 250.125 → 250
    expect(computePlatformFeeCents(10005, 250)).toBe(250);
    // 10050 * 250 / 10000 = 251.25 → 251
    expect(computePlatformFeeCents(10050, 250)).toBe(251);
  });

  it('respects custom bps', () => {
    // 1000 * 500 / 10000 = 50
    expect(computePlatformFeeCents(1000, 500)).toBe(50);
  });

  it('handles large amounts', () => {
    // 1_00_00_000 (= LKR 100,000.00) * 250 bps / 10000 = 250_000
    expect(computePlatformFeeCents(1_00_00_000, 250)).toBe(250_000);
  });
});
