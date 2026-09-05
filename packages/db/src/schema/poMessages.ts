import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

export const poMessages = sqliteTable(
  'po_messages',
  {
    id: text('id').primaryKey(),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    senderUserId: text('sender_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    readAt: integer('read_at'),
  },
  (t) => ({
    poIdx: index('po_messages_po_idx').on(t.purchaseOrderId, t.createdAt),
    senderIdx: index('po_messages_sender_idx').on(t.senderUserId, t.createdAt),
  }),
);

export type PoMessage = typeof poMessages.$inferSelect;
export type NewPoMessage = typeof poMessages.$inferInsert;
