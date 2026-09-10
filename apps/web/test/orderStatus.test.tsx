import { describe, expect, it } from 'vitest';
import { ORDER_TRANSITIONS, canTransition } from '@vyro/shared';

describe('order status truth', () => {
  it('has no in_transit or in_flight statuses', () => {
    expect(Object.keys(ORDER_TRANSITIONS)).not.toContain('in_transit');
    expect(Object.keys(ORDER_TRANSITIONS)).not.toContain('in_flight');
  });
  it('business can cancel a pending order', () => {
    expect(canTransition('pending', 'cancelled', 'business')).toBe(true);
  });
  it('preparing goes to ready_for_pickup, not in_transit', () => {
    expect(ORDER_TRANSITIONS['preparing']).toContain('ready_for_pickup');
  });
});
