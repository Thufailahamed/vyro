import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const paymentIdempotencyKeys = sqliteTable('payment_idempotency_keys', {
  key: text('key').notNull(),
  userId: text('user_id').notNull(),
  requestHash: text('request_hash').notNull(),
  responseJson: text('response_json').notNull(),
  statusCode: integer('status_code').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type PaymentIdempotencyKey = typeof paymentIdempotencyKeys.$inferSelect;
