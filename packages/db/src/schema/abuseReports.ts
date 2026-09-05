import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const abuseReports = sqliteTable(
  'abuse_reports',
  {
    id: text('id').primaryKey(),
    reporterUserId: text('reporter_user_id').references(() => users.id),
    targetType: text('target_type', {
      enum: ['user', 'business', 'supplier', 'product', 'review'],
    }).notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason', {
      enum: ['spam', 'fraud', 'harassment', 'misinformation', 'other'],
    }).notNull(),
    details: text('details'),
    status: text('status', {
      enum: ['open', 'investigating', 'resolved', 'dismissed'],
    })
      .notNull()
      .default('open'),
    assignedTo: text('assigned_to').references(() => users.id),
    resolutionNotes: text('resolution_notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    statusIdx: index('abuse_reports_status_idx').on(t.status),
    targetIdx: index('abuse_reports_target_idx').on(t.targetType, t.targetId),
    assignedIdx: index('abuse_reports_assigned_idx').on(t.assignedTo),
  }),
);

export type AbuseReport = typeof abuseReports.$inferSelect;
export type NewAbuseReport = typeof abuseReports.$inferInsert;
