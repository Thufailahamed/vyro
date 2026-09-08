import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

export const categoryMappings = sqliteTable(
  'category_mappings',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').references(() => businesses.id),
    matchPattern: text('match_pattern').notNull(),
    categorySlug: text('category_slug').notNull(),
    priority: integer('priority').notNull().default(0),
    source: text('source', { enum: ['seed', 'manual'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    businessIdx: index('category_mappings_business_idx').on(t.businessId, t.priority),
    businessPatternIdx: uniqueIndex('category_mappings_business_pattern_idx').on(
      t.businessId,
      t.matchPattern,
    ),
  }),
);

export type CategoryMapping = typeof categoryMappings.$inferSelect;
export type NewCategoryMapping = typeof categoryMappings.$inferInsert;
