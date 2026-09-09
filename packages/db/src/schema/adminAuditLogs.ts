import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const adminAuditLogs = sqliteTable(
  'admin_audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').notNull().references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    before: text('before'),
    after: text('after'),
    requestId: text('request_id').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    batchId: text('batch_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    createdIdx: index('admin_audit_logs_created_idx').on(t.createdAt),
    actorIdx: index('admin_audit_logs_actor_idx').on(t.actorId, t.createdAt),
    targetIdx: index('admin_audit_logs_target_idx').on(t.targetType, t.targetId, t.createdAt),
    batchIdx: index('admin_audit_logs_batch_idx').on(t.batchId),
  }),
);

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;
