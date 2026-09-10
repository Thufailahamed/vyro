import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

/**
 * COD collections (spec §9). COD is never marked paid merely because the
 * order was delivered — cash collection is an explicit, recorded event with
 * expected vs collected amounts and reconciliation status.
 */
export const codCollections = sqliteTable(
  'cod_collections',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    expectedCents: integer('expected_cents').notNull(),
    collectedCents: integer('collected_cents'),
    discrepancyCents: integer('discrepancy_cents').notNull().default(0),
    currency: text('currency').notNull().default('LKR'),
    status: text('status', {
      enum: ['pending', 'collected', 'partial', 'failed', 'refused', 'disputed'],
    })
      .notNull()
      .default('pending'),
    collectorUserId: text('collector_user_id').references(() => users.id),
    collectorName: text('collector_name'),
    collectionMethod: text('collection_method'),
    collectionReference: text('collection_reference'),
    collectedAt: integer('collected_at'),
    reconciliationStatus: text('reconciliation_status', {
      enum: ['unreconciled', 'matched', 'under_collected', 'over_collected', 'missing', 'disputed', 'reconciled'],
    })
      .notNull()
      .default('unreconciled'),
    reconciledAt: integer('reconciled_at'),
    reconciledByUserId: text('reconciled_by_user_id').references(() => users.id),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    paymentIdx: index('cod_collections_payment_idx').on(t.paymentId),
    poIdx: index('cod_collections_po_idx').on(t.purchaseOrderId),
    reconIdx: index('cod_collections_recon_idx').on(t.reconciliationStatus),
  }),
);

export type CodCollection = typeof codCollections.$inferSelect;
export type NewCodCollection = typeof codCollections.$inferInsert;
