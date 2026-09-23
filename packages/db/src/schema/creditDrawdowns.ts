import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { purchaseOrders } from './purchaseOrders';

export const creditDrawdowns = sqliteTable(
  'credit_drawdowns',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    purchaseOrderId: text('purchase_order_id').notNull().unique().references(() => purchaseOrders.id),
    amountCents: integer('amount_cents').notNull(),
    repaidCents: integer('repaid_cents').notNull().default(0),
    terms: text('terms', { enum: ['net14', 'net30'] }).notNull(),
    dueAt: integer('due_at').notNull(),
    status: text('status', { enum: ['active', 'repaid', 'overdue', 'released'] }).notNull().default('active'),
    repaidAt: integer('repaid_at'),
    /** Amount written off the facility because the order shrank or died. */
    releasedCents: integer('released_cents').notNull().default(0),
    releasedAt: integer('released_at'),
    /** Dunning: last buyer reminder stage sent (see cron/creditDunning.ts). */
    lastReminderStage: text('last_reminder_stage'),
    lastReminderAt: integer('last_reminder_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    bizStatusDueIdx: index('credit_drawdowns_biz_status_due_idx').on(t.businessId, t.status, t.dueAt),
  }),
);

export type CreditDrawdown = typeof creditDrawdowns.$inferSelect;
export type NewCreditDrawdown = typeof creditDrawdowns.$inferInsert;
