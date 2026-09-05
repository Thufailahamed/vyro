import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const kycReviews = sqliteTable(
  'kyc_reviews',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'needs_more_info'],
    })
      .notNull()
      .default('pending'),
    documentsJson: text('documents_json'),
    notes: text('notes'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    reviewedAt: integer('reviewed_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    statusIdx: index('kyc_reviews_status_idx').on(t.status),
    userIdx: index('kyc_reviews_user_idx').on(t.userId),
  }),
);

export type KycReview = typeof kycReviews.$inferSelect;
export type NewKycReview = typeof kycReviews.$inferInsert;
