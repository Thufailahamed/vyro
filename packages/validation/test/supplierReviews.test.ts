import { describe, expect, it } from 'vitest';
import {
  submitReviewSchema,
  replySchema,
  flagSchema,
  resolveFlagSchema,
  reviewListQuerySchema,
  adminFlagsQuerySchema,
} from '../src/supplierReviews';

describe('supplierReviews validation', () => {
  describe('submitReviewSchema', () => {
    it('accepts a valid submission', () => {
      const r = submitReviewSchema.safeParse({
        orderId: '00000000-0000-0000-0000-000000000001',
        rating: 5,
        body: 'Fast delivery, great tea.',
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.rating).toBe(5);
    });
    it('rejects rating above 5', () => {
      expect(
        submitReviewSchema.safeParse({
          orderId: '00000000-0000-0000-0000-000000000001',
          rating: 6,
          body: 'x',
        }).success,
      ).toBe(false);
    });
    it('rejects rating below 1', () => {
      expect(
        submitReviewSchema.safeParse({
          orderId: '00000000-0000-0000-0000-000000000001',
          rating: 0,
          body: 'x',
        }).success,
      ).toBe(false);
    });
    it('rejects non-integer rating', () => {
      expect(
        submitReviewSchema.safeParse({
          orderId: '00000000-0000-0000-0000-000000000001',
          rating: 4.5,
          body: 'x',
        }).success,
      ).toBe(false);
    });
    it('rejects body > 2000 chars', () => {
      expect(
        submitReviewSchema.safeParse({
          orderId: '00000000-0000-0000-0000-000000000001',
          rating: 5,
          body: 'a'.repeat(2001),
        }).success,
      ).toBe(false);
    });
    it('rejects non-uuid orderId', () => {
      expect(
        submitReviewSchema.safeParse({ orderId: 'nope', rating: 5, body: 'x' }).success,
      ).toBe(false);
    });
    it('rejects empty body', () => {
      expect(
        submitReviewSchema.safeParse({
          orderId: '00000000-0000-0000-0000-000000000001',
          rating: 5,
          body: '',
        }).success,
      ).toBe(false);
    });
  });

  describe('replySchema', () => {
    it('accepts a valid reply', () => {
      expect(replySchema.safeParse({ body: 'thanks!' }).success).toBe(true);
    });
    it('rejects body > 1000 chars', () => {
      expect(replySchema.safeParse({ body: 'a'.repeat(1001) }).success).toBe(false);
    });
    it('rejects empty body', () => {
      expect(replySchema.safeParse({ body: '' }).success).toBe(false);
    });
  });

  describe('flagSchema', () => {
    it('accepts known reasons', () => {
      for (const r of ['abuse', 'spam', 'off_topic', 'pii', 'other'] as const) {
        expect(flagSchema.safeParse({ reason: r }).success).toBe(true);
      }
    });
    it('rejects unknown reason', () => {
      expect(flagSchema.safeParse({ reason: 'whatever' }).success).toBe(false);
    });
    it('accepts optional note up to 500', () => {
      expect(flagSchema.safeParse({ reason: 'spam', note: 'a'.repeat(500) }).success).toBe(true);
    });
    it('rejects note > 500 chars', () => {
      expect(flagSchema.safeParse({ reason: 'spam', note: 'a'.repeat(501) }).success).toBe(false);
    });
  });

  describe('resolveFlagSchema', () => {
    it('accepts keep', () => {
      expect(resolveFlagSchema.safeParse({ decision: 'keep' }).success).toBe(true);
    });
    it('accepts remove', () => {
      expect(resolveFlagSchema.safeParse({ decision: 'remove' }).success).toBe(true);
    });
    it('rejects unknown decision', () => {
      expect(resolveFlagSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
    });
  });

  describe('reviewListQuerySchema', () => {
    it('defaults sort to recent and limit to 10', () => {
      const r = reviewListQuerySchema.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.sort).toBe('recent');
        expect(r.data.limit).toBe(10);
      }
    });
    it('coerces limit string', () => {
      const r = reviewListQuerySchema.safeParse({ limit: '25' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.limit).toBe(25);
    });
    it('rejects limit > 50', () => {
      expect(reviewListQuerySchema.safeParse({ limit: '100' }).success).toBe(false);
    });
    it('rejects unknown sort', () => {
      expect(reviewListQuerySchema.safeParse({ sort: 'oldest' }).success).toBe(false);
    });
  });

  describe('adminFlagsQuerySchema', () => {
    it('defaults to pending', () => {
      const r = adminFlagsQuerySchema.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.status).toBe('pending');
    });
  });
});