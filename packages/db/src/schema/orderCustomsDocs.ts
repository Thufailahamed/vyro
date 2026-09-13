import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

export const orderCustomsDocs = sqliteTable(
  'order_customs_docs',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    kind: text('kind', { enum: ['invoice', 'packing-list', 'coo', 'awb', 'bl'] }).notNull(),
    r2Path: text('r2_path').notNull(),
    uploadedAt: integer('uploaded_at').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    orderIdx: index('order_customs_docs_order_idx').on(t.orderId),
  }),
);

export type OrderCustomsDoc = typeof orderCustomsDocs.$inferSelect;
export type NewOrderCustomsDoc = typeof orderCustomsDocs.$inferInsert;