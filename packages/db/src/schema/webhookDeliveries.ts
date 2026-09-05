import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { webhooks } from './webhooks';

export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id')
      .notNull()
      .references(() => webhooks.id),
    eventType: text('event_type').notNull(),
    payloadJson: text('payload_json').notNull(),
    status: text('status', {
      enum: ['pending', 'success', 'failed'],
    })
      .notNull()
      .default('pending'),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextRetryAt: integer('next_retry_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    webhookIdx: index('webhook_deliveries_webhook_idx').on(t.webhookId, t.createdAt),
    statusIdx: index('webhook_deliveries_status_idx').on(t.status),
  }),
);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
