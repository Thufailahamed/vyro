import { describe, expect, it } from 'vitest';
import * as repo from '../../src/modules/reviews/repository';

describe('reviews repository shape', () => {
  it('exports insert/find review helpers', () => {
    expect(typeof repo.insertReview).toBe('function');
    expect(typeof repo.findReviewById).toBe('function');
    expect(typeof repo.findReviewByOrder).toBe('function');
  });

  it('exports list + aggregate helpers', () => {
    expect(typeof repo.listReviews).toBe('function');
    expect(typeof repo.aggregateForSupplier).toBe('function');
  });

  it('exports status transition helpers', () => {
    expect(typeof repo.updateReviewStatus).toBe('function');
    expect(typeof repo.updateReviewsForOrderByStatus).toBe('function');
  });

  it('exports reply helpers', () => {
    expect(typeof repo.insertReply).toBe('function');
    expect(typeof repo.findReplyByReview).toBe('function');
  });

  it('exports flag helpers', () => {
    expect(typeof repo.insertFlag).toBe('function');
    expect(typeof repo.listPendingFlags).toBe('function');
    expect(typeof repo.updateFlag).toBe('function');
  });
});