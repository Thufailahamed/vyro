import { describe, expect, it } from 'vitest';
import * as svc from '../../src/modules/reviews/service';

describe('reviews service shape', () => {
  it('exports checkEligibility and recomputeAggregate', () => {
    expect(typeof svc.checkEligibility).toBe('function');
    expect(typeof svc.recomputeAggregate).toBe('function');
    expect(typeof svc.submitReview).toBe('function');
  });

  it('exports reply/flag/admin-resolve', () => {
    expect(typeof svc.postReply).toBe('function');
    expect(typeof svc.flagReview).toBe('function');
    expect(typeof svc.resolveFlag).toBe('function');
  });

  it('ReviewError carries a code', () => {
    const e = new svc.ReviewError('not_buyer');
    expect(e.code).toBe('not_buyer');
    expect(e.message).toBe('not_buyer');
    expect(e).toBeInstanceOf(Error);
  });
});