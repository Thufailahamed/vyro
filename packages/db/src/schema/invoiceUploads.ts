import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { users } from './users';
import { suppliers } from './suppliers';

export const invoiceUploads = sqliteTable(
  'invoice_uploads',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    uploadedByUserId: text('uploaded_by_user_id').notNull().references(() => users.id),
    supplierId: text('supplier_id').references(() => suppliers.id),
    status: text('status', {
      enum: ['pending', 'processing', 'ready', 'reviewed', 'failed', 'manual_required'],
    }).notNull(),
    r2Key: text('r2_key').notNull(),
    mimeType: text('mime_type').notNull(),
    originalFilename: text('original_filename').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    ocrProvider: text('ocr_provider'),
    ocrConfidence: integer('ocr_confidence'),
    rawExtractionJson: text('raw_extraction_json'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at').notNull(),
    reviewedAt: integer('reviewed_at'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
    totalCents: integer('total_cents'),
  },
  (t) => ({
    businessIdx: index('invoice_uploads_business_idx').on(t.businessId, t.createdAt),
    statusIdx: index('invoice_uploads_status_idx').on(t.status),
  }),
);

export type InvoiceUpload = typeof invoiceUploads.$inferSelect;
export type NewInvoiceUpload = typeof invoiceUploads.$inferInsert;
