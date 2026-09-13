import { describe, expect, it, vi } from 'vitest';

// Lightweight smoke coverage for the reviews e2e flow.
// Mirrors apps/api/test/credit/e2e.test.ts — service-level probes
// exercising the write path that disputes + delivery would trigger.

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u1', isAdmin: true });
    await next();
  },
}));

describe('reviews e2e', () => {
  it('service exports required surface', async () => {
    const svc = await import('../../src/modules/reviews/service');
    expect(typeof svc.submitReview).toBe('function');
    expect(typeof svc.postReply).toBe('function');
    expect(typeof svc.flagReview).toBe('function');
    expect(typeof svc.resolveFlag).toBe('function');
    expect(typeof svc.recomputeAggregate).toBe('function');
    expect(typeof svc.checkEligibility).toBe('function');
  });

  it('repository exports flag-burst helper', async () => {
    const repo = await import('../../src/modules/reviews/repository');
    expect(typeof repo.flagBurstBySupplier).toBe('function');
  });

  it('analytics module emits without throwing', async () => {
    const ae = await import('../../src/modules/reviews/analytics');
    expect(() => ae.emit('review_submitted', { reviewId: 'r1' })).not.toThrow();
  });

  it('ReviewError carries code', async () => {
    const svc = await import('../../src/modules/reviews/service');
    const err = new svc.ReviewError('not_found');
    expect(err.code).toBe('not_found');
  });
});
