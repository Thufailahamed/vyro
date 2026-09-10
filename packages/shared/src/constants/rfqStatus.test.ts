import { describe, it, expect } from 'vitest';
import { canTransitionRfq, canTransitionQuote, RFQ_TRANSITIONS, QUOTE_TRANSITIONS } from './rfqStatus';

describe('RFQ state machine', () => {
  it('draft -> open by business', () => {
    expect(canTransitionRfq('draft', 'open', 'business')).toBe(true);
  });
  it('draft -> open forbidden for supplier', () => {
    expect(canTransitionRfq('draft', 'open', 'supplier')).toBe(false);
  });
  it('full happy path is walkable', () => {
    const path: Array<[string, string]> = [
      ['draft', 'open'], ['open', 'quoting'], ['quoting', 'quotes_received'],
      ['quotes_received', 'under_review'], ['under_review', 'awarded'], ['awarded', 'converted_to_order'],
    ];
    for (const [from, to] of path) {
      expect((RFQ_TRANSITIONS as Record<string, readonly string[]>)[from]).toContain(to);
    }
  });
  it('cannot award twice (awarded has no award edge)', () => {
    expect(canTransitionRfq('awarded', 'awarded', 'business')).toBe(false);
    expect(canTransitionRfq('converted_to_order', 'awarded', 'business')).toBe(false);
  });
  it('expired can be reopened by business', () => {
    expect(canTransitionRfq('expired', 'open', 'business')).toBe(true);
  });
  it('terminal states block transitions', () => {
    expect(canTransitionRfq('cancelled', 'open', 'business')).toBe(false);
    expect(canTransitionRfq('closed', 'open', 'admin')).toBe(false);
  });
  it('admin override allows any legal edge', () => {
    expect(canTransitionRfq('open', 'quoting', 'admin')).toBe(true);
    // but not an edge that does not exist
    expect(canTransitionRfq('draft', 'awarded', 'admin')).toBe(false);
  });
});

describe('quote state machine', () => {
  it('draft -> submitted -> accepted path', () => {
    expect(canTransitionQuote('draft', 'submitted')).toBe(true);
    expect(canTransitionQuote('submitted', 'accepted')).toBe(true);
  });
  it('accepted is terminal', () => {
    expect(canTransitionQuote('accepted', 'submitted')).toBe(false);
  });
  it('expired can resubmit', () => {
    expect(canTransitionQuote('expired', 'submitted')).toBe(true);
  });
  it('negotiating can resolve', () => {
    expect(QUOTE_TRANSITIONS.negotiating).toContain('accepted');
    expect(QUOTE_TRANSITIONS.negotiating).toContain('rejected');
  });
});
