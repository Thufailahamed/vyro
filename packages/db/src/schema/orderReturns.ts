import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { purchaseOrderItems } from './purchaseOrderItems';

export const orderReturns = sqliteTable(
  'order_returns',
  {
    id: text('id').primaryKey(),
    rmaNumber: text('rma_number').notNull(),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    businessId: text('business_id').notNull(),
    supplierId: text('supplier_id').notNull(),
    status: text('status', {
      enum: ['requested', 'approved', 'rejected', 'received', 'refunded', 'cancelled', 'closed'],
    })
      .notNull()
      .default('requested'),
    reasonCode: text('reason_code').notNull(),
    reasonNote: text('reason_note'),
    supplierNote: text('supplier_note'),
    rejectionReason: text('rejection_reason'),
    requestedByUserId: text('requested_by_user_id').notNull(),
    decidedByUserId: text('decided_by_user_id'),
    receivedByUserId: text('received_by_user_id'),
    refundCents: integer('refund_cents').notNull().default(0),
    creditNoteInvoiceId: text('credit_note_invoice_id'),
    requestedAt: integer('requested_at').notNull(),
    decidedAt: integer('decided_at'),
    receivedAt: integer('received_at'),
    refundedAt: integer('refunded_at'),
    escalatedAt: integer('escalated_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    rmaUq: uniqueIndex('order_returns_rma_uq').on(t.rmaNumber),
    poIdx: index('order_returns_po_idx').on(t.purchaseOrderId),
    supplierStatusIdx: index('order_returns_supplier_status_idx').on(t.supplierId, t.status),
    businessStatusIdx: index('order_returns_business_status_idx').on(t.businessId, t.status),
  }),
);

export const orderReturnItems = sqliteTable(
  'order_return_items',
  {
    id: text('id').primaryKey(),
    returnId: text('return_id')
      .notNull()
      .references(() => orderReturns.id),
    purchaseOrderItemId: text('purchase_order_item_id')
      .notNull()
      .references(() => purchaseOrderItems.id),
    quantity: integer('quantity').notNull(),
    approvedQuantity: integer('approved_quantity'),
    receivedQuantity: integer('received_quantity'),
    restock: integer('restock', { mode: 'boolean' }).notNull().default(true),
    unitRefundCents: integer('unit_refund_cents').notNull(),
    conditionNote: text('condition_note'),
  },
  (t) => ({
    returnIdx: index('order_return_items_return_idx').on(t.returnId),
    poiIdx: index('order_return_items_poi_idx').on(t.purchaseOrderItemId),
  }),
);

export const orderReturnAttachments = sqliteTable(
  'order_return_attachments',
  {
    id: text('id').primaryKey(),
    returnId: text('return_id')
      .notNull()
      .references(() => orderReturns.id),
    r2Key: text('r2_key').notNull(),
    contentType: text('content_type'),
    uploadedByUserId: text('uploaded_by_user_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    returnIdx: index('order_return_attachments_return_idx').on(t.returnId),
  }),
);

export type OrderReturn = typeof orderReturns.$inferSelect;
export type NewOrderReturn = typeof orderReturns.$inferInsert;
export type OrderReturnItem = typeof orderReturnItems.$inferSelect;
export type OrderReturnAttachment = typeof orderReturnAttachments.$inferSelect;
