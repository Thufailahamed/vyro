import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    method: text('method', { enum: ['cash', 'bank_transfer', 'online'] }).notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'failed', 'refunded'] })
      .notNull()
      .default('pending'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    transactionReference: text('transaction_reference'),
    paidAt: integer('paid_at'),
    confirmedAt: integer('confirmed_at'),
    confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ poIdx: index('payments_po_idx').on(t.purchaseOrderId) }),
);

export type Payment = typeof payments.$inferSelect;
