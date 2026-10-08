import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { suppliers } from './suppliers';
import { products } from './products';
import { invoiceUploads } from './invoiceUploads';
import { users } from './users';

/** Buyer-confirmed OCR description aliases scoped to a business and supplier. */
export const invoiceProductAliases = sqliteTable(
  'invoice_product_aliases',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    supplierId: text('supplier_id').notNull().references(() => suppliers.id),
    normalizedAlias: text('normalized_alias').notNull(),
    productId: text('product_id').notNull().references(() => products.id),
    sourceUploadId: text('source_upload_id').notNull().references(() => invoiceUploads.id),
    createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    scopeAliasIdx: uniqueIndex('invoice_product_aliases_scope_alias_idx').on(
      t.businessId,
      t.supplierId,
      t.normalizedAlias,
    ),
  }),
);

export type InvoiceProductAlias = typeof invoiceProductAliases.$inferSelect;
export type NewInvoiceProductAlias = typeof invoiceProductAliases.$inferInsert;
