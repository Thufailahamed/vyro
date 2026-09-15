import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { supplierReviews } from './supplierReviews';
import { users } from './users';

export const supplierReviewHelpfulVotes = sqliteTable(
  'supplier_review_helpful_votes',
  {
    reviewId: text('review_id')
      .notNull()
      .references(() => supplierReviews.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.reviewId, t.userId] }),
    reviewIdx: index('supplier_review_helpful_review_idx').on(t.reviewId),
  }),
);

export type SupplierReviewHelpfulVote = typeof supplierReviewHelpfulVotes.$inferSelect;
export type NewSupplierReviewHelpfulVote = typeof supplierReviewHelpfulVotes.$inferInsert;
