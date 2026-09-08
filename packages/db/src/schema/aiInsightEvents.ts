import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

export const aiInsightEvents = sqliteTable(
  'ai_insight_events',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    kind: text('kind').notNull(),
    payloadJson: text('payload_json').notNull(),
    payloadHash: text('payload_hash').notNull(),
    dispatchedAt: text('dispatched_at').notNull(),
    status: text('status', { enum: ['pending', 'sent', 'dismissed', 'acted'] }).notNull(),
  },
  (t) => ({
    bizKindHashUq: uniqueIndex('ai_insight_events_biz_kind_hash_uq').on(t.businessId, t.kind, t.payloadHash),
    businessDispatchedIdx: index('ai_insight_events_business_dispatched_idx').on(t.businessId, t.dispatchedAt),
  }),
);

export type AiInsightEvent = typeof aiInsightEvents.$inferSelect;
export type NewAiInsightEvent = typeof aiInsightEvents.$inferInsert;
