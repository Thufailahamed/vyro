import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';
import { products } from './products';

export const supplierProducts = sqliteTable(
  'supplier_products',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    supplierSku: text('supplier_sku'),
    priceCents: integer('price_cents').notNull(),
    minOrderQty: integer('min_order_qty').notNull().default(1),
    tier1MinQty: integer('tier1_min_qty').notNull().default(10),
    tier1DiscountPct: integer('tier1_discount_pct').notNull().default(0),
    tier2MinQty: integer('tier2_min_qty').notNull().default(50),
    tier2DiscountPct: integer('tier2_discount_pct').notNull().default(0),
    tier3MinQty: integer('tier3_min_qty').notNull().default(100),
    tier3DiscountPct: integer('tier3_discount_pct').notNull().default(0),
    leadTimeDays: integer('lead_time_days').notNull().default(1),
    deliveryAvailable: integer('delivery_available', { mode: 'boolean' }).notNull().default(true),
    deliveryRadiusKm: integer('delivery_radius_km'),
    availabilityStatus: text('availability_status', { enum: ['in_stock', 'low', 'out_of_stock'] })
      .notNull()
      .default('in_stock'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    uniq: uniqueIndex('supplier_products_supplier_product_uniq').on(t.supplierId, t.productId),
    productIdx: index('supplier_products_product_idx').on(t.productId),
    supplierIdx: index('supplier_products_supplier_idx').on(t.supplierId),
  }),
);

export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type NewSupplierProduct = typeof supplierProducts.$inferInsert;
