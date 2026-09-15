import { z } from 'zod';

export const ratingSchema = z.number().int().min(1).max(5);
export type Rating = z.infer<typeof ratingSchema>;

export const reviewStatusSchema = z.enum([
  'published',
  'hidden_by_flag',
  'hidden_by_dispute',
  'removed_by_admin',
]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const flagReasonSchema = z.enum(['abuse', 'spam', 'off_topic', 'pii', 'other']);
export type FlagReason = z.infer<typeof flagReasonSchema>;

export const flagStatusSchema = z.enum(['pending', 'resolved_keep', 'resolved_remove']);
export type FlagStatus = z.infer<typeof flagStatusSchema>;

export const reviewSortSchema = z.enum(['recent', 'highest', 'lowest']);
export type ReviewSort = z.infer<typeof reviewSortSchema>;

export const submitReviewSchema = z
  .object({
    orderId: z.string().uuid(),
    rating: ratingSchema,
    body: z.string().min(1).max(2000),
    imageR2Keys: z.array(z.string().min(1).max(500)).max(3).optional(),
  })
  .strict();
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const editReviewSchema = z
  .object({
    rating: ratingSchema,
    body: z.string().min(1).max(2000),
  })
  .strict();
export type EditReviewInput = z.infer<typeof editReviewSchema>;

export const replySchema = z
  .object({
    body: z.string().min(1).max(1000),
  })
  .strict();
export type ReplyInput = z.infer<typeof replySchema>;

export const flagSchema = z
  .object({
    reason: flagReasonSchema,
    note: z.string().max(500).optional(),
  })
  .strict();
export type FlagInput = z.infer<typeof flagSchema>;

export const resolveFlagSchema = z
  .object({
    decision: z.enum(['keep', 'remove']),
    note: z.string().max(500).optional(),
  })
  .strict();
export type ResolveFlagInput = z.infer<typeof resolveFlagSchema>;

export const reviewListQuerySchema = z
  .object({
    sort: reviewSortSchema.default('recent'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    cursor: z.string().uuid().optional(),
  })
  .strict();
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export const adminFlagsQuerySchema = z
  .object({
    status: flagStatusSchema.default('pending'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().uuid().optional(),
  })
  .strict();
export type AdminFlagsQuery = z.infer<typeof adminFlagsQuerySchema>;