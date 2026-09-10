import { describe, expect, it } from 'vitest';

function savingsLine(discountCents: number, pct: number, nextQty: number | null) {
  const save = discountCents > 0 ? `You save Rs. ${discountCents}` : '';
  const nudge = nextQty != null ? `Add ${nextQty} more to unlock` : '';
  return `${save} ${nudge}`.trim();
}

describe('tier display copy', () => {
  it('shows savings and unlock nudge', () => {
    expect(savingsLine(500, 5, 40)).toContain('You save');
    expect(savingsLine(500, 5, 40)).toContain('Add 40 more');
  });
  it('shows no savings text at list price', () => {
    expect(savingsLine(0, 0, 10)).toBe('Add 10 more to unlock');
  });
  it('shows no nudge at top tier', () => {
    expect(savingsLine(500, 15, null)).toBe('You save Rs. 500');
  });
});
