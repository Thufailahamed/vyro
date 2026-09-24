import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

/**
 * Cards kept on file with payments.lk (buyer convenience). We never store PAN
 * or CVV — only the provider card id and display metadata. Charges happen
 * off-session via the provider API using the provider card id.
 */
export const savedCards = sqliteTable(
  'saved_cards',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    paymentsLkCardId: text('payments_lk_card_id').notNull(),
    brand: text('brand'),
    last4: text('last4'),
    expiryMonth: integer('expiry_month'),
    expiryYear: integer('expiry_year'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    businessIdx: index('saved_cards_business_idx').on(t.businessId),
    businessCardUq: uniqueIndex('saved_cards_business_card_uq').on(t.businessId, t.paymentsLkCardId),
  }),
);

export type SavedCard = typeof savedCards.$inferSelect;
export type NewSavedCard = typeof savedCards.$inferInsert;
