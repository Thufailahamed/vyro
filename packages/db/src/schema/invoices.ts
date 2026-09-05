import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
import { purchaseOrders } from './purchaseOrders';
import { businesses } from './businesses';
import { suppliers } from './suppliers';
import { users } from './users';

export const invoiceSequences = sqliteTable(
  'invoice_sequences',
  {
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    year: integer('year').notNull(),
    type: text('type', { enum: ['receipt', 'tax_invoice'] }).notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (t) => ({
    pk: uniqueIndex('invoice_sequences_pk').on(t.supplierId, t.year, t.type),
  }),
);

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    number: text('number').notNull().unique(),
    type: text('type', { enum: ['receipt', 'tax_invoice'] }).notNull(),
    paymentId: text('payment_id').references(() => payments.id),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    subtotalCents: integer('subtotal_cents').notNull(),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('LKR'),
    issuedAt: integer('issued_at').notNull(),
    dueAt: integer('due_at'),
    htmlSnapshot: text('html_snapshot').notNull(),
    pdfGeneratedAt: integer('pdf_generated_at'),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    poIdx: index('invoices_po_idx').on(t.purchaseOrderId),
    supplierIssuedIdx: index('invoices_supplier_issued_idx').on(t.supplierId, t.issuedAt),
    businessIdx: index('invoices_business_idx').on(t.businessId),
  }),
);

export const invoiceItems = sqliteTable(
  'invoice_items',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unitCents: integer('unit_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
  },
  (t) => ({
    invoiceIdx: index('invoice_items_invoice_idx').on(t.invoiceId),
  }),
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type InvoiceSequence = typeof invoiceSequences.$inferSelect;
