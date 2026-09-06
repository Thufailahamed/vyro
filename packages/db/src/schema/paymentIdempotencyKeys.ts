import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const paymentIdempotencyKeys = sqliteTable(
  'payment_idempotency_keys',
  {
    key: text('key').notNull(),
    userId: text('user_id').notNull(),
    requestHash: text('request_hash').notNull(),
    responseJson: text('response_json').notNull(),
    statusCode: integer('status_code').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.key] }),
  }),
);

export type PaymentIdempotencyKey = typeof paymentIdempotencyKeys.$inferSelect;
