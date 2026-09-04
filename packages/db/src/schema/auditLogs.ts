import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    metadata: text('metadata'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    resourceIdx: index('audit_logs_resource_idx').on(t.resourceType, t.resourceId),
    actorIdx: index('audit_logs_actor_idx').on(t.actorUserId, t.createdAt),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
