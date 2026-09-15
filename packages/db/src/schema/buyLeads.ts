import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';

export const supplierBuyLeadSubscriptions = sqliteTable(
  'supplier_buy_lead_subscriptions',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    categoryIdsJson: text('category_ids_json').notNull().default('[]'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    supplierUniq: uniqueIndex('supplier_buy_lead_subs_supplier_uniq').on(t.supplierId),
  }),
);

export type SupplierBuyLeadSubscription = typeof supplierBuyLeadSubscriptions.$inferSelect;
export type NewSupplierBuyLeadSubscription = typeof supplierBuyLeadSubscriptions.$inferInsert;
