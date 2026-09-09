import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const queueEvents = sqliteTable(
  'queue_events',
  {
    id: text('id').primaryKey(),
    queue: text('queue').notNull(),
    msgId: text('msg_id').notNull(),
    event: text('event').notNull(),
    actorUserId: text('actor_user_id'),
    payloadJson: text('payload_json'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    queueCreatedIdx: index('idx_queue_events_queue_created').on(t.queue, t.createdAt),
    eventCreatedIdx: index('idx_queue_events_event_created').on(t.event, t.createdAt),
    createdIdx: index('idx_queue_events_created').on(t.createdAt),
  }),
);

export type QueueEvent = typeof queueEvents.$inferSelect;
export type QueueEventInsert = typeof queueEvents.$inferInsert;