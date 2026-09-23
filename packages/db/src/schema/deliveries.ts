import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

export const deliveries = sqliteTable('deliveries', {
  id: text('id').primaryKey(),
  purchaseOrderId: text('purchase_order_id')
    .notNull()
    .unique()
    .references(() => purchaseOrders.id),
  status: text('status', {
    enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'],
  })
    .notNull()
    .default('pending'),
  driverName: text('driver_name'),
  driverPhone: text('driver_phone'),
  estimatedAt: integer('estimated_at'),
  pickedUpAt: integer('picked_up_at'),
  deliveredAt: integer('delivered_at'),
  assignedByUserId: text('assigned_by_user_id').references(() => users.id),
  carrier: text('carrier'),
  trackingNumber: text('tracking_number'),
  trackingUrl: text('tracking_url'),
  recipientName: text('recipient_name'),
  podPhotoKey: text('pod_photo_key'),
  podNote: text('pod_note'),
  podCapturedByUserId: text('pod_captured_by_user_id'),
  podCapturedAt: integer('pod_captured_at'),
  failedReason: text('failed_reason'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Delivery = typeof deliveries.$inferSelect;
