import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const dataExportRequests = sqliteTable('data_export_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  requestedBy: text('requested_by')
    .notNull()
    .references(() => users.id),
  status: text('status', {
    enum: ['pending', 'ready', 'failed', 'expired'],
  })
    .notNull()
    .default('pending'),
  downloadUrl: text('download_url'),
  expiresAt: integer('expires_at'),
  createdAt: integer('created_at').notNull(),
});

export type DataExportRequest = typeof dataExportRequests.$inferSelect;
export type NewDataExportRequest = typeof dataExportRequests.$inferInsert;
