import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

export const orderEvents = sqliteTable(
  'order_events',
  {
    id: text('id').primaryKey(),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    actorUserId: text('actor_user_id').references(() => users.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    reason: text('reason'),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({ poIdx: index('order_events_po_idx').on(t.purchaseOrderId) }),
);

export type OrderEvent = typeof orderEvents.$inferSelect;
