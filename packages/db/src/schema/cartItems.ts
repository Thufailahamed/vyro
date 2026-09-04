import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { carts } from './carts';
import { supplierProducts } from './supplierProducts';

export const cartItems = sqliteTable(
  'cart_items',
  {
    id: text('id').primaryKey(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id),
    supplierProductId: text('supplier_product_id')
      .notNull()
      .references(() => supplierProducts.id),
    quantity: integer('quantity').notNull(),
  },
  (t) => ({ uniq: uniqueIndex('cart_items_cart_sp_uniq').on(t.cartId, t.supplierProductId) }),
);

export type CartItem = typeof cartItems.$inferSelect;
