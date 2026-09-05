import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const auditExportSchedules = sqliteTable(
  'audit_export_schedules',
  {
    id: text('id').primaryKey(),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id),
    frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly'] }).notNull(),
    email: text('email').notNull(),
    format: text('format', { enum: ['csv', 'json'] }).notNull().default('csv'),
    nextRunAt: integer('next_run_at').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    lastRunAt: integer('last_run_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    activeIdx: index('audit_export_schedules_active_idx').on(t.active, t.nextRunAt),
    requestedByIdx: index('audit_export_schedules_requested_by_idx').on(t.requestedBy),
  }),
);

export type AuditExportSchedule = typeof auditExportSchedules.$inferSelect;
export type NewAuditExportSchedule = typeof auditExportSchedules.$inferInsert;
