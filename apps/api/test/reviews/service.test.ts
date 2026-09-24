import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateReviewStatus: vi.fn(async () => undefined),
  aggregateForSupplier: vi.fn(async () => ({
    count: 0,
    avg: null,
    avgX100: 0,
    lastReviewAt: null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  })),
  setSupplierReviewAggregate: vi.fn(async () => undefined),
  findReviewById: vi.fn(async () => ({
    id: 'r1',
    supplierId: 'sup-1',
    orderId: 'o1',
    status: 'published',
    createdAt: 0,
  })),
}));

vi.mock('../../src/modules/reviews/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/modules/reviews/repository')>()),
  findReviewById: mocks.findReviewById,
  updateReviewStatus: mocks.updateReviewStatus,
  aggregateForSupplier: mocks.aggregateForSupplier,
  setSupplierReviewAggregate: mocks.setSupplierReviewAggregate,
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => ({ id: 'o1', businessId: 'b1', supplierId: 'sup-1' }),
        }),
      }),
    }),
  }),
}));

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

  it('exports dispute hooks', () => {
    expect(typeof svc.markOrderDisputed).toBe('function');
    expect(typeof svc.markOrderResolved).toBe('function');
  });

  it('ReviewError carries a code', () => {
    const e = new svc.ReviewError('not_buyer');
    expect(e.code).toBe('not_buyer');
    expect(e.message).toBe('not_buyer');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('deleteReviewByBuyer', () => {
  it('marks the review with status removed_by_buyer', async () => {
    mocks.updateReviewStatus.mockClear();
    const D1_STUB = {} as D1Database;
    await svc.deleteReviewByBuyer(D1_STUB, 'r1', {
      userId: 'u1',
      allowedBusinessIds: ['b1'],
    });
    expect(mocks.updateReviewStatus).toHaveBeenCalledTimes(1);
    const args = mocks.updateReviewStatus.mock.calls[0];
    expect(args[1]).toBe('r1');
    expect(args[2]).toBe('removed_by_buyer');
  });
});