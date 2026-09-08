import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { invoiceUploads } from './invoiceUploads';
import { businesses } from './businesses';
import { products } from './products';

export const invoiceLineItems = sqliteTable(
  'invoice_line_items',
  {
    id: text('id').primaryKey(),
    uploadId: text('upload_id').notNull().references(() => invoiceUploads.id),
    businessId: text('business_id').notNull().references(() => businesses.id),
    lineNumber: integer('line_number').notNull(),
    description: text('description').notNull(),
    quantity: real('quantity'),
    unit: text('unit'),
    unitPriceCents: integer('unit_price_cents'),
    totalCents: integer('total_cents'),
    categorySlug: text('category_slug'),
    categorySource: text('category_source', {
      enum: ['rule', 'default', 'manual'],
    }).notNull(),
    productId: text('product_id').references(() => products.id),
  },
  (t) => ({
    uploadIdx: index('invoice_line_items_upload_idx').on(t.uploadId, t.lineNumber),
    businessCatIdx: index('invoice_line_items_business_cat_idx').on(
      t.businessId,
      t.categorySlug,
      t.uploadId,
    ),
    categoryIdx: index('invoice_line_items_category_idx').on(t.categorySlug),
  }),
);

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
