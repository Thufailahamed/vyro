import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { businesses } from './businesses';

export const aiPreferences = sqliteTable(
  'ai_preferences',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    businessId: text('business_id').references(() => businesses.id),
    kind: text('kind', {
      enum: ['preferred_supplier', 'frequently_ordered', 'procurement_default'],
    }).notNull(),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull(),
    source: text('source', { enum: ['user', 'inferred'] }).notNull(),
    confidence: real('confidence').notNull().default(1.0),
    occurrences: integer('occurrences').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    bizKindKeyUq: uniqueIndex('ai_preferences_biz_kind_key_uq').on(t.businessId, t.kind, t.key),
    businessKindIdx: index('ai_preferences_business_idx').on(t.businessId, t.kind),
  }),
);

export type AiPreference = typeof aiPreferences.$inferSelect;
export type NewAiPreference = typeof aiPreferences.$inferInsert;
