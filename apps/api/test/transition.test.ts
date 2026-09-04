import { describe, expect, it } from 'vitest';
import { canTransition, OrderStatus } from '@vyro/shared';

describe('order state machine', () => {
  it('supplier can accept a pending PO', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.ACCEPTED, 'supplier')).toBe(true);
  });

  it('business can cancel pending or accepted', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.CANCELLED, 'business')).toBe(true);
    expect(canTransition(OrderStatus.ACCEPTED, OrderStatus.CANCELLED, 'business')).toBe(true);
  });

  it('business cannot start preparing', () => {
    expect(canTransition(OrderStatus.ACCEPTED, OrderStatus.PREPARING, 'business')).toBe(false);
  });

  it('admin can mark delivered → disputed', () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.DISPUTED, 'admin')).toBe(true);
  });

  it('terminal states cannot transition', () => {
    expect(canTransition(OrderStatus.REJECTED, OrderStatus.PENDING, 'admin')).toBe(false);
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.PENDING, 'admin')).toBe(false);
    expect(canTransition(OrderStatus.DISPUTED, OrderStatus.COMPLETED, 'admin')).toBe(false);
  });

  it('business confirms completion on delivered', () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.COMPLETED, 'business')).toBe(true);
  });

  it('supplier advances delivery: ready_for_pickup → out_for_delivery → delivered', () => {
    expect(canTransition(OrderStatus.READY_FOR_PICKUP, OrderStatus.OUT_FOR_DELIVERY, 'supplier')).toBe(true);
    expect(canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, 'supplier')).toBe(true);
  });
});
