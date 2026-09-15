import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';

export const trustSealSubscriptions = sqliteTable(
  'trust_seal_subscriptions',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    status: text('status', { enum: ['pending', 'active', 'expired', 'cancelled'] })
      .notNull()
      .default('pending'),
    startedAt: integer('started_at'),
    expiresAt: integer('expires_at'),
    paymentId: text('payment_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    supplierUniq: uniqueIndex('trust_seal_supplier_uniq').on(t.supplierId),
  }),
);

export type TrustSealSubscription = typeof trustSealSubscriptions.$inferSelect;
export type NewTrustSealSubscription = typeof trustSealSubscriptions.$inferInsert;
