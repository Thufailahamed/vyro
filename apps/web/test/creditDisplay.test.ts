import { describe, expect, it } from 'vitest';
import {
  drawdownStatusLabel,
  remainingCents,
  termsLabel,
  unlockSlotState,
} from '../src/lib/creditDisplay';

describe('creditDisplay', () => {
  it('labels Net 14 / Net 30 terms', () => {
    expect(termsLabel('net14')).toBe('Net 14');
    expect(termsLabel('net30')).toBe('Net 30');
  });

  it('marks unlock slots from paid-order count', () => {
    expect(unlockSlotState(0, 0)).toBe('current');
    expect(unlockSlotState(1, 0)).toBe('todo');
    expect(unlockSlotState(0, 2)).toBe('done');
    expect(unlockSlotState(2, 2)).toBe('current');
    expect(unlockSlotState(2, 3)).toBe('done');
  });

  it('computes remaining drawdown', () => {
    expect(remainingCents(10_000, 2_500)).toBe(7_500);
    expect(remainingCents(100, 200)).toBe(0);
  });

  it('labels drawdown status for buyers', () => {
    expect(drawdownStatusLabel('active')).toBe('Open');
    expect(drawdownStatusLabel('overdue')).toBe('Overdue');
    expect(drawdownStatusLabel('repaid')).toBe('Repaid');
  });
});
