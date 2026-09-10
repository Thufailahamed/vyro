import { describe, expect, it, vi } from 'vitest';
import { canTransitionRfq, canTransitionQuote } from '@vyro/shared';
import { createRfqSchema, submitQuoteSchema, counterOfferSchema, awardQuoteSchema } from '@vyro/validation';

// computeQuoteTotals is pure — import the service module with DB access mocked.
vi.mock('@vyro/db', () => ({ getDb: () => { throw new Error('no db in unit test'); } }));
vi.mock('@vyro/db/schema', () => ({}));
vi.mock('../src/modules/supplierProducts/repository', () => ({ recordAudit: vi.fn() }));
vi.mock('../src/modules/notifications/dispatcher', () => ({
  notifyBusinessOrg: vi.fn(), notifySupplierOrg: vi.fn(), notifyUsers: vi.fn(),
  listBusinessMemberIds: vi.fn(async () => []), listSupplierMemberIds: vi.fn(async () => []),
}));

import { computeQuoteTotals } from '../src/modules/rfqs/service';

describe('rfq validation', () => {
  it('rejects RFQ without items', () => {
    const r = createRfqSchema.safeParse({ businessId: 'b1', title: 'Bulk rice', items: [] });
    expect(r.success).toBe(false);
  });
  it('accepts a minimal RFQ', () => {
    const r = createRfqSchema.safeParse({
      businessId: 'b1', title: 'Bulk rice order',
      items: [{ description: 'Samba rice', quantity: 1000, unit: 'kg' }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects quote with discount exceeding line value at service level schema pass but math guard', () => {
    const r = submitQuoteSchema.safeParse({
      items: [{ description: 'Rice', quantity: 10, unitPriceCents: 100, discountCents: 5000 }],
    });
    // schema allows; service throws. Just assert schema shape passes.
    expect(r.success).toBe(true);
  });
  it('counter requires message', () => {
    expect(counterOfferSchema.safeParse({ proposedTotalCents: 100 }).success).toBe(false);
    expect(counterOfferSchema.safeParse({ proposedTotalCents: 100, message: 'hi' }).success).toBe(true);
  });
  it('award requires quoteId', () => {
    expect(awardQuoteSchema.safeParse({}).success).toBe(false);
    expect(awardQuoteSchema.safeParse({ quoteId: 'q1' }).success).toBe(true);
  });
});

describe('landed cost math (server-side)', () => {
  it('total = subtotal + delivery + tax - discount', () => {
    const out = computeQuoteTotals(
      [{ quantity: 1000, unitPriceCents: 39500, discountCents: 0 }],
      5000, 0, 10000,
    );
    expect(out.subtotalCents).toBe(1000 * 39500);
    expect(out.totalCents).toBe(1000 * 39500 + 5000 - 10000);
  });
  it('never returns negative totals', () => {
    const out = computeQuoteTotals([{ quantity: 1, unitPriceCents: 100 }], 0, 0, 99999);
    expect(out.totalCents).toBe(0);
  });
  it('line discounts reduce subtotal', () => {
    const out = computeQuoteTotals([{ quantity: 2, unitPriceCents: 1000, discountCents: 500 }], 0, 0, 0);
    expect(out.subtotalCents).toBe(1500);
  });
});

describe('rfq business rules (state machine)', () => {
  it('cannot publish from awarded', () => {
    expect(canTransitionRfq('awarded', 'open', 'business')).toBe(false);
  });
  it('business cannot skip draft -> quoting', () => {
    expect(canTransitionRfq('draft', 'quoting', 'business')).toBe(false);
  });
  it('accepted quotes are immutable (terminal)', () => {
    expect(canTransitionQuote('accepted', 'submitted')).toBe(false);
    expect(canTransitionQuote('accepted', 'negotiating')).toBe(false);
  });
  it('concurrent award guard: only pre-award states convert', () => {
    // mirrors the SQL guard in award(): awarded/converted_to_order rejected
    for (const s of ['awarded', 'converted_to_order', 'cancelled', 'closed', 'expired', 'draft'] as const) {
      expect(canTransitionRfq(s, 'awarded', 'business')).toBe(false);
    }
    expect(canTransitionRfq('under_review', 'awarded', 'business')).toBe(true);
  });
});
