import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';

export const paymentEvents = sqliteTable(
  'payment_events',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    providerPaymentId: text('provider_payment_id'),
    statusCode: integer('status_code'),
    payloadHash: text('payload_hash').notNull(),
    receivedAt: integer('received_at').notNull(),
    processedAt: integer('processed_at'),
    processingStatus: text('processing_status').notNull().default('received'),
  },
  (t) => ({
    paymentIdx: index('payment_events_payment_idx').on(t.paymentId, t.receivedAt),
    dedupeUq: uniqueIndex('payment_events_dedupe_uq').on(t.paymentId, t.statusCode, t.providerPaymentId),
  }),
);

export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type NewPaymentEvent = typeof paymentEvents.$inferInsert;
