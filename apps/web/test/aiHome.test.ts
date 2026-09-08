import { describe, expect, it } from 'vitest';
import { greetingForHour, savingsHeadline, moveHeadline, formatLKR } from '../src/ai/home';

describe('AI home helpers', () => {
  it('greets by hour', () => {
    expect(greetingForHour(9)).toBe('Good morning');
    expect(greetingForHour(14)).toBe('Good afternoon');
    expect(greetingForHour(20)).toBe('Good evening');
  });

  it('formats savings headline with evidence', () => {
    expect(savingsHeadline(0)).toMatch(/No savings/);
    expect(savingsHeadline(1840000)).toContain('Rs.');
  });

  it('summarizes price moves', () => {
    expect(moveHeadline([])).toMatch(/No significant/);
    expect(moveHeadline([{ productName: 'Rice', from: 10000, to: 10800, pct: 8 }])).toContain('Rice');
  });

  it('formats LKR or em-dash', () => {
    expect(formatLKR(null)).toBe('—');
    expect(formatLKR(1840000)).toContain('Rs.');
  });
});
