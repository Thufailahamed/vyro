import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { supplierReviews } from './supplierReviews';
import { suppliers } from './suppliers';

export const supplierReviewReplies = sqliteTable(
  'supplier_review_replies',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => supplierReviews.id),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    uniqPerReview: uniqueIndex('supplier_review_replies_review_uniq').on(t.reviewId),
  }),
);

export type SupplierReviewReply = typeof supplierReviewReplies.$inferSelect;
export type NewSupplierReviewReply = typeof supplierReviewReplies.$inferInsert;