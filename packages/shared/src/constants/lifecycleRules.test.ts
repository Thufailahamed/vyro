import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canResolveDispute,
  canTransition,
  isReasonRequired,
} from './orderStatus';
import { canTransitionReturn } from './returnStatus';

describe('order lifecycle rules', () => {
  it('supplier can cancel after accepting, but not once goods are packed', () => {
    expect(canTransition('accepted', 'cancelled', 'supplier')).toBe(true);
    expect(canTransition('preparing', 'cancelled', 'supplier')).toBe(true);
    expect(canTransition('ready_for_pickup', 'cancelled', 'supplier')).toBe(false);
    expect(canTransition('ready_for_pickup', 'cancelled', 'business')).toBe(false);
    expect(canTransition('ready_for_pickup', 'cancelled', 'admin')).toBe(true);
  });

  it('system (cron) may only auto-cancel pending and auto-complete delivered', () => {
    expect(canTransition('pending', 'cancelled', 'system')).toBe(true);
    expect(canTransition('delivered', 'completed', 'system')).toBe(true);
    expect(canTransition('pending', 'accepted', 'system')).toBe(false);
    expect(canTransition('accepted', 'cancelled', 'system')).toBe(false);
    expect(canTransition('delivered', 'disputed', 'system')).toBe(false);
  });

  it('disputes exit only through the resolution flow', () => {
    expect(canTransition('disputed', 'completed', 'admin')).toBe(false);
    expect(canTransition('disputed', 'cancelled', 'admin')).toBe(false);
    expect(canResolveDispute('disputed', 'completed')).toBe(true);
    expect(canResolveDispute('disputed', 'cancelled')).toBe(true);
    expect(canResolveDispute('disputed', 'delivered')).toBe(false);
    expect(canResolveDispute('delivered', 'completed')).toBe(false);
  });

  it('reasons are required for negative outcomes', () => {
    expect(isReasonRequired('rejected')).toBe(true);
    expect(isReasonRequired('cancelled')).toBe(true);
    expect(isReasonRequired('disputed')).toBe(true);
    expect(isReasonRequired('accepted')).toBe(false);
  });

  it('allowedTransitions lists what each side may do', () => {
    expect(allowedTransitions('pending', 'supplier').sort()).toEqual(['accepted', 'rejected']);
    expect(allowedTransitions('pending', 'business')).toEqual(['cancelled']);
    expect(allowedTransitions('delivered', 'business').sort()).toEqual(['completed', 'disputed']);
    expect(allowedTransitions('disputed', 'admin')).toEqual([]);
  });
});

describe('return (RMA) rules', () => {
  it('supplier decides and receives; buyer can withdraw; system settles', () => {
    expect(canTransitionReturn('requested', 'approved', 'supplier')).toBe(true);
    expect(canTransitionReturn('requested', 'approved', 'business')).toBe(false);
    expect(canTransitionReturn('requested', 'cancelled', 'business')).toBe(true);
    expect(canTransitionReturn('approved', 'received', 'supplier')).toBe(true);
    expect(canTransitionReturn('received', 'refunded', 'supplier')).toBe(false);
    expect(canTransitionReturn('received', 'refunded', 'system')).toBe(true);
    expect(canTransitionReturn('rejected', 'approved', 'admin')).toBe(false);
  });
});
