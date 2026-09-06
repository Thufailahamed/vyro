import { describe, expect, it } from 'vitest';
import {
  DELIVERY_TRANSITIONS,
  canTransitionDelivery,
} from '../src/delivery';

describe('delivery state machine', () => {
  it('allows supplier pending → assigned', () => {
    expect(canTransitionDelivery('pending', 'assigned', 'supplier')).toBe(true);
  });
  it('forbids business from any transition', () => {
    for (const from of ['pending', 'assigned', 'picked_up', 'in_transit'] as const) {
      for (const to of ['assigned', 'picked_up', 'in_transit', 'delivered', 'failed'] as const) {
        expect(canTransitionDelivery(from, to, 'business')).toBe(false);
      }
    }
  });
  it('blocks direct pending → delivered', () => {
    expect(canTransitionDelivery('pending', 'delivered', 'supplier')).toBe(false);
    expect(canTransitionDelivery('pending', 'delivered', 'admin')).toBe(false);
  });
  it('allows admin reversal delivered → in_transit', () => {
    expect(canTransitionDelivery('delivered', 'in_transit', 'admin')).toBe(true);
    expect(canTransitionDelivery('delivered', 'in_transit', 'supplier')).toBe(false);
  });
  it('allows admin retry failed → pending', () => {
    expect(canTransitionDelivery('failed', 'pending', 'admin')).toBe(true);
    expect(canTransitionDelivery('failed', 'pending', 'supplier')).toBe(false);
  });
  it('allows supplier to mark in_transit → delivered', () => {
    expect(canTransitionDelivery('in_transit', 'delivered', 'supplier')).toBe(true);
  });
  it('blocks illegal source states (e.g. delivered → pending)', () => {
    expect(canTransitionDelivery('delivered', 'pending', 'admin')).toBe(false);
  });
  it('all transitions reference declared statuses', () => {
    const declared = new Set(['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed']);
    for (const r of DELIVERY_TRANSITIONS) {
      expect(declared.has(r.from)).toBe(true);
      expect(declared.has(r.to)).toBe(true);
    }
  });
});
