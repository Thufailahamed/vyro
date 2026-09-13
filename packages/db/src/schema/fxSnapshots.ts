import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const fxSnapshots = sqliteTable(
  'fx_snapshots',
  {
    id: text('id').primaryKey(),
    base: text('base').notNull(),
    quoteCurrency: text('quote_currency').notNull(),
    // rate stored as integer-scaled string (rate * 1e8), no float drift
    rateScaled: text('rate_scaled').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    provider: text('provider', { enum: ['CBSL', 'EXCHANGERATE_HOST'] }).notNull(),
  },
  (t) => ({
    pairFetchedIdx: index('fx_snapshots_pair_fetched_idx').on(t.base, t.quoteCurrency, t.fetchedAt),
  }),
);

export type FxSnapshot = typeof fxSnapshots.$inferSelect;
export type NewFxSnapshot = typeof fxSnapshots.$inferInsert;