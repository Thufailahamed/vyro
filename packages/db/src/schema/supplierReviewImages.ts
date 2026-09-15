import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { supplierReviews } from './supplierReviews';

export const supplierReviewImages = sqliteTable(
  'supplier_review_images',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => supplierReviews.id),
    r2Key: text('r2_key').notNull(),
    mime: text('mime'),
    sizeBytes: integer('size_bytes'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    reviewIdx: index('supplier_review_images_review_idx').on(t.reviewId),
  }),
);

export type SupplierReviewImage = typeof supplierReviewImages.$inferSelect;
export type NewSupplierReviewImage = typeof supplierReviewImages.$inferInsert;
