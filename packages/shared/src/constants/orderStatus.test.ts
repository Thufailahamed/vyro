import { describe, it, expect } from 'vitest';
import { canTransition } from './orderStatus';

describe('canTransition', () => {
  it('allows supplier to accept pending', () => {
    expect(canTransition('pending', 'accepted', 'supplier')).toBe(true);
  });
  it('forbids business from accepting', () => {
    expect(canTransition('pending', 'accepted', 'business')).toBe(false);
  });
  it('allows business to cancel pending', () => {
    expect(canTransition('pending', 'cancelled', 'business')).toBe(true);
  });
  it('forbids skipping states', () => {
    expect(canTransition('pending', 'preparing', 'supplier')).toBe(false);
  });
  it('blocks terminal transitions', () => {
    expect(canTransition('completed', 'pending', 'admin')).toBe(false);
    expect(canTransition('cancelled', 'completed', 'business')).toBe(false);
  });
});
