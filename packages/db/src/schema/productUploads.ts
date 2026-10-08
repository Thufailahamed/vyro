import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { users } from './users';
import { suppliers } from './suppliers';
import { products } from './products';

// AI product upload sessions: one row per supplier file staged for the
// extraction pipeline (queue consumer fills product_upload_rows).
export const productUploadSessions = sqliteTable(
  'product_upload_sessions',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    supplierId: text('supplier_id').notNull().references(() => suppliers.id),
    userId: text('user_id').notNull().references(() => users.id),
    status: text('status', {
      enum: ['pending', 'extracting', 'extracted', 'failed', 'committed'],
    }).notNull(),
    sourceKind: text('source_kind', {
      enum: ['csv', 'tsv', 'photo_pdf', 'product_photo'],
    }).notNull(),
    r2Key: text('r2_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    errorMessage: text('error_message'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    committedAt: integer('committed_at'),
  },
  (t) => ({
    supplierIdx: index('product_upload_sessions_supplier_idx').on(t.supplierId, t.createdAt),
    statusIdx: index('product_upload_sessions_status_idx').on(t.status),
  }),
);

export const productUploadRows = sqliteTable(
  'product_upload_rows',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => productUploadSessions.id),
    rowIndex: integer('row_index').notNull(),
    rawJson: text('raw_json').notNull(),
    productName: text('product_name').notNull(),
    supplierSku: text('supplier_sku'),
    unit: text('unit'),
    priceLkr: real('price_lkr'),
    minOrderQty: integer('min_order_qty'),
    leadTimeDays: integer('lead_time_days'),
    stockQty: integer('stock_qty'),
    tier1MinQty: integer('tier1_min_qty'),
    tier1DiscountPct: integer('tier1_discount_pct'),
    tier2MinQty: integer('tier2_min_qty'),
    tier2DiscountPct: integer('tier2_discount_pct'),
    tier3MinQty: integer('tier3_min_qty'),
    tier3DiscountPct: integer('tier3_discount_pct'),
    confidence: integer('confidence').notNull(),
    matchType: text('match_type', {
      enum: ['offer', 'product', 'proposal', 'none'],
    }).notNull(),
    matchProductId: text('match_product_id').references(() => products.id),
    matchScore: integer('match_score').notNull(),
    decision: text('decision', { enum: ['accepted', 'edited', 'rejected'] }).notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    sessionIdx: index('product_upload_rows_session_idx').on(t.sessionId, t.rowIndex),
  }),
);

export type ProductUploadSession = typeof productUploadSessions.$inferSelect;
export type NewProductUploadSession = typeof productUploadSessions.$inferInsert;
export type ProductUploadRow = typeof productUploadRows.$inferSelect;
export type NewProductUploadRow = typeof productUploadRows.$inferInsert;
