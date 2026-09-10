import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Commission rules (spec §15). Ordered by precedence: product > supplier >
 * category > global. The APPLIED rate/value is snapshotted onto each
 * allocation/earning so historical transactions never change when rules do.
 */
export const commissionRules = sqliteTable(
  'commission_rules',
  {
    id: text('id').primaryKey(),
    scope: text('scope', {
      enum: ['global', 'category', 'supplier', 'product', 'promotional'],
    })
      .notNull()
      .default('global'),
    scopeId: text('scope_id'),
    bps: integer('bps').notNull(),
    name: text('name'),
    startsAt: integer('starts_at'),
    endsAt: integer('ends_at'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    scopeIdx: index('commission_rules_scope_idx').on(t.scope, t.scopeId),
    activeIdx: index('commission_rules_active_idx').on(t.active),
  }),
);

export type CommissionRule = typeof commissionRules.$inferSelect;
export type NewCommissionRule = typeof commissionRules.$inferInsert;
