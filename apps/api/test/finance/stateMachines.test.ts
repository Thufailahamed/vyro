import { describe, expect, it } from 'vitest';
import {
  canTransitionPayment,
  canTransitionRefund,
  canTransitionSettlement,
  canTransitionPayout,
  toCanonicalMethod,
  toLegacyMethod,
  toCanonicalStatus,
  isTerminalPaymentStatus,
} from '@vyro/shared';

describe('financial state machines (backend-controlled)', () => {
  it('payment: pending can move to processing/paid/failed/cancelled/expired/verification', () => {
    for (const to of ['PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'PENDING_VERIFICATION']) {
      expect(canTransitionPayment('PENDING', to)).toBe(true);
    }
  });

  it('payment: terminal states are closed', () => {
    for (const s of ['FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED']) {
      expect(canTransitionPayment(s, 'PAID')).toBe(false);
      expect(isTerminalPaymentStatus(s)).toBe(true);
    }
  });

  it('payment: paid can only refund (never back to pending)', () => {
    expect(canTransitionPayment('PAID', 'PENDING')).toBe(false);
    expect(canTransitionPayment('PAID', 'REFUNDED')).toBe(true);
    expect(canTransitionPayment('PAID', 'PARTIALLY_REFUNDED')).toBe(true);
  });

  it('payment: legacy confirmed maps to canonical PAID', () => {
    expect(toCanonicalStatus('confirmed')).toBe('PAID');
    expect(toCanonicalStatus('pending')).toBe('PENDING');
    expect(canTransitionPayment('pending', 'PAID')).toBe(true);
  });

  it('methods map both directions without loss', () => {
    expect(toCanonicalMethod('online')).toBe('PAYHERE');
    expect(toCanonicalMethod('cash')).toBe('COD');
    expect(toCanonicalMethod('bank_transfer')).toBe('BANK_TRANSFER');
    expect(toLegacyMethod('PAYHERE')).toBe('online');
    expect(toLegacyMethod('COD')).toBe('cash');
    expect(toLegacyMethod('BANK_TRANSFER')).toBe('bank_transfer');
    expect(() => toCanonicalMethod('bitcoin')).toThrow();
  });

  it('refund: requested → approved → processing → completed', () => {
    expect(canTransitionRefund('requested', 'approved')).toBe(true);
    expect(canTransitionRefund('approved', 'processing')).toBe(true);
    expect(canTransitionRefund('processing', 'completed')).toBe(true);
    expect(canTransitionRefund('completed', 'processing')).toBe(false);
    expect(canTransitionRefund('requested', 'completed')).toBe(false);
  });

  it('refund: rejection and cancellation legs exist', () => {
    expect(canTransitionRefund('requested', 'rejected')).toBe(true);
    expect(canTransitionRefund('requested', 'cancelled')).toBe(true);
    expect(canTransitionRefund('processing', 'failed')).toBe(true);
    expect(canTransitionRefund('failed', 'processing')).toBe(true);
  });

  it('settlement: pending → approved → processing → completed', () => {
    expect(canTransitionSettlement('pending', 'approved')).toBe(true);
    expect(canTransitionSettlement('approved', 'processing')).toBe(true);
    expect(canTransitionSettlement('processing', 'completed')).toBe(true);
    expect(canTransitionSettlement('pending', 'completed')).toBe(false);
    expect(canTransitionSettlement('completed', 'processing')).toBe(false);
  });

  it('payout: completed/paid are immutable', () => {
    expect(canTransitionPayout('completed', 'processing')).toBe(false);
    expect(canTransitionPayout('paid', 'failed')).toBe(false);
    expect(canTransitionPayout('pending', 'approved')).toBe(true);
    expect(canTransitionPayout('failed', 'processing')).toBe(true);
  });
});
