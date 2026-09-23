import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { supplierProducts } from './supplierProducts';

/** Saved order lists ("order guides") a buyer re-orders from in one tap. */
export const orderLists = sqliteTable(
  'order_lists',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    createdByUserId: text('created_by_user_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    bizIdx: index('order_lists_biz_idx').on(t.businessId, t.updatedAt),
  }),
);

export const orderListItems = sqliteTable(
  'order_list_items',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => orderLists.id, { onDelete: 'cascade' }),
    supplierProductId: text('supplier_product_id')
      .notNull()
      .references(() => supplierProducts.id),
    quantity: integer('quantity').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('order_list_items_list_sp_uniq').on(t.listId, t.supplierProductId),
  }),
);

export type OrderList = typeof orderLists.$inferSelect;
export type OrderListItem = typeof orderListItems.$inferSelect;
