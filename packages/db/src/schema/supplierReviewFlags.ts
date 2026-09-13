import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { supplierReviews } from './supplierReviews';

export const supplierReviewFlags = sqliteTable(
  'supplier_review_flags',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => supplierReviews.id),
    flaggedBy: text('flagged_by', {
      enum: ['buyer', 'supplier', 'admin', 'system'],
    }).notNull(),
    flaggedByUserId: text('flagged_by_user_id'),
    reason: text('reason', {
      enum: ['abuse', 'spam', 'off_topic', 'pii', 'other'],
    }).notNull(),
    note: text('note'),
    status: text('status', {
      enum: ['pending', 'resolved_keep', 'resolved_remove'],
    })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at').notNull(),
    resolvedAt: integer('resolved_at'),
    resolvedBy: text('resolved_by'),
  },
  (t) => ({
    queueIdx: index('supplier_review_flags_status_created_idx').on(t.status, t.createdAt),
  }),
);

export type SupplierReviewFlag = typeof supplierReviewFlags.$inferSelect;
export type NewSupplierReviewFlag = typeof supplierReviewFlags.$inferInsert;