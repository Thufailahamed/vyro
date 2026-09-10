/**
 * Catalog of in-app notification types plus the preference category each maps
 * to. The dispatcher (apps/api/src/modules/notifications/dispatcher.ts) uses
 * `NOTIFICATION_CATEGORY` to decide which user/supplier preference gates a
 * given notification, so a new type cannot silently bypass opt-outs.
 */

export const NotificationCategory = {
  ORDER: 'order',
  MESSAGE: 'message',
  PAYMENT: 'payment',
  STOCK: 'stock',
  MARKETING: 'marketing',
  SYSTEM: 'system',
  ADMIN_ALERT: 'admin_alert',
} as const;

export const ADMIN_ALERT_SEVERITY = ['info', 'warning', 'critical'] as const;
export type AdminAlertSeverity = (typeof ADMIN_ALERT_SEVERITY)[number];
export type NotificationCategory =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];

export const NotificationType = {
  ORDER_PLACED: 'order.placed',
  ORDER_ACCEPTED: 'order.accepted',
  ORDER_REJECTED: 'order.rejected',
  ORDER_PREPARING: 'order.preparing',
  ORDER_READY: 'order.ready_for_pickup',
  ORDER_DISPATCHED: 'order.out_for_delivery',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_COMPLETED: 'order.completed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_DISPUTED: 'order.disputed',
  DELIVERY_UPDATED: 'delivery.updated',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_PENDING_VERIFICATION: 'payment.pending_verification',
  BANK_TRANSFER_SUBMITTED: 'bank_transfer.submitted',
  BANK_TRANSFER_VERIFIED: 'bank_transfer.verified',
  BANK_TRANSFER_REJECTED: 'bank_transfer.rejected',
  COD_COLLECTED: 'cod.collected',
  COD_DISCREPANCY: 'cod.discrepancy',
  REFUND_INITIATED: 'refund.initiated',
  REFUND_COMPLETED: 'refund.completed',
  REFUND_FAILED: 'refund.failed',
  EARNING_CREATED: 'earning.created',
  SETTLEMENT_AVAILABLE: 'settlement.available',
  PAYOUT_INITIATED: 'payout.initiated',
  PAYOUT_COMPLETED: 'payout.completed',
  PAYOUT_FAILED: 'payout.failed',
  INVOICE_AVAILABLE: 'invoice.available',
  RECONCILIATION_EXCEPTION: 'reconciliation.exception',
  DISPUTE_RESOLVED: 'dispute.resolved',
  STOCK_LOW: 'stock.low',
  STOCK_OUT: 'stock.out',
  PO_MESSAGE: 'po.message',
  RFQ_INVITED: 'rfq.invited',
  RFQ_OPENED: 'rfq.opened',
  RFQ_VIEWED: 'rfq.viewed',
  QUOTE_RECEIVED: 'rfq.quote_received',
  QUOTE_UPDATED: 'rfq.quote_updated',
  QUOTE_COUNTERED: 'rfq.countered',
  QUOTE_ACCEPTED: 'rfq.accepted',
  QUOTE_REJECTED: 'rfq.rejected',
  RFQ_CANCELLED: 'rfq.cancelled',
  RFQ_EXPIRED: 'rfq.expired',
  RFQ_MESSAGE: 'rfq.message',
  RFQ_REVISION_REQUESTED: 'rfq.revision_requested',
  RFQ_DEADLINE_SOON: 'rfq.deadline_soon',
  QUOTE_EXPIRING: 'rfq.quote_expiring',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NOTIFICATION_CATEGORY: Record<string, NotificationCategory> = {
  [NotificationType.ORDER_PLACED]: NotificationCategory.ORDER,
  [NotificationType.ORDER_ACCEPTED]: NotificationCategory.ORDER,
  [NotificationType.ORDER_REJECTED]: NotificationCategory.ORDER,
  [NotificationType.ORDER_PREPARING]: NotificationCategory.ORDER,
  [NotificationType.ORDER_READY]: NotificationCategory.ORDER,
  [NotificationType.ORDER_DISPATCHED]: NotificationCategory.ORDER,
  [NotificationType.ORDER_DELIVERED]: NotificationCategory.ORDER,
  [NotificationType.ORDER_COMPLETED]: NotificationCategory.ORDER,
  [NotificationType.ORDER_CANCELLED]: NotificationCategory.ORDER,
  [NotificationType.ORDER_DISPUTED]: NotificationCategory.ORDER,
  [NotificationType.DELIVERY_UPDATED]: NotificationCategory.ORDER,
  [NotificationType.PAYMENT_RECEIVED]: NotificationCategory.PAYMENT,
  [NotificationType.PAYMENT_FAILED]: NotificationCategory.PAYMENT,
  [NotificationType.PAYMENT_INITIATED]: NotificationCategory.PAYMENT,
  [NotificationType.PAYMENT_PENDING_VERIFICATION]: NotificationCategory.PAYMENT,
  [NotificationType.BANK_TRANSFER_SUBMITTED]: NotificationCategory.PAYMENT,
  [NotificationType.BANK_TRANSFER_VERIFIED]: NotificationCategory.PAYMENT,
  [NotificationType.BANK_TRANSFER_REJECTED]: NotificationCategory.PAYMENT,
  [NotificationType.COD_COLLECTED]: NotificationCategory.PAYMENT,
  [NotificationType.COD_DISCREPANCY]: NotificationCategory.PAYMENT,
  [NotificationType.REFUND_INITIATED]: NotificationCategory.PAYMENT,
  [NotificationType.REFUND_COMPLETED]: NotificationCategory.PAYMENT,
  [NotificationType.REFUND_FAILED]: NotificationCategory.PAYMENT,
  [NotificationType.EARNING_CREATED]: NotificationCategory.PAYMENT,
  [NotificationType.SETTLEMENT_AVAILABLE]: NotificationCategory.PAYMENT,
  [NotificationType.PAYOUT_INITIATED]: NotificationCategory.PAYMENT,
  [NotificationType.PAYOUT_COMPLETED]: NotificationCategory.PAYMENT,
  [NotificationType.PAYOUT_FAILED]: NotificationCategory.PAYMENT,
  [NotificationType.INVOICE_AVAILABLE]: NotificationCategory.PAYMENT,
  [NotificationType.RECONCILIATION_EXCEPTION]: NotificationCategory.ADMIN_ALERT,
  [NotificationType.DISPUTE_RESOLVED]: NotificationCategory.ORDER,
  [NotificationType.STOCK_LOW]: NotificationCategory.STOCK,
  [NotificationType.STOCK_OUT]: NotificationCategory.STOCK,
  [NotificationType.PO_MESSAGE]: NotificationCategory.MESSAGE,
  [NotificationType.RFQ_INVITED]: NotificationCategory.ORDER,
  [NotificationType.RFQ_OPENED]: NotificationCategory.ORDER,
  [NotificationType.RFQ_VIEWED]: NotificationCategory.ORDER,
  [NotificationType.QUOTE_RECEIVED]: NotificationCategory.ORDER,
  [NotificationType.QUOTE_UPDATED]: NotificationCategory.ORDER,
  [NotificationType.QUOTE_COUNTERED]: NotificationCategory.ORDER,
  [NotificationType.QUOTE_ACCEPTED]: NotificationCategory.ORDER,
  [NotificationType.QUOTE_REJECTED]: NotificationCategory.ORDER,
  [NotificationType.RFQ_CANCELLED]: NotificationCategory.ORDER,
  [NotificationType.RFQ_EXPIRED]: NotificationCategory.ORDER,
  [NotificationType.RFQ_MESSAGE]: NotificationCategory.MESSAGE,
  [NotificationType.RFQ_REVISION_REQUESTED]: NotificationCategory.ORDER,
  [NotificationType.RFQ_DEADLINE_SOON]: NotificationCategory.ORDER,
  [NotificationType.QUOTE_EXPIRING]: NotificationCategory.ORDER,
};

export function categoryForNotificationType(type: string): NotificationCategory {
  return NOTIFICATION_CATEGORY[type] ?? NotificationCategory.SYSTEM;
}

/** Order status -> notification type for lifecycle transitions. */
export const ORDER_STATUS_NOTIFICATION: Record<string, NotificationType> = {
  pending: NotificationType.ORDER_PLACED,
  accepted: NotificationType.ORDER_ACCEPTED,
  rejected: NotificationType.ORDER_REJECTED,
  preparing: NotificationType.ORDER_PREPARING,
  ready_for_pickup: NotificationType.ORDER_READY,
  out_for_delivery: NotificationType.ORDER_DISPATCHED,
  delivered: NotificationType.ORDER_DELIVERED,
  completed: NotificationType.ORDER_COMPLETED,
  cancelled: NotificationType.ORDER_CANCELLED,
  disputed: NotificationType.ORDER_DISPUTED,
};

/** Human copy for each order status, used in notification titles/bodies. */
export const ORDER_STATUS_COPY: Record<string, { label: string; buyer: string; supplier: string }> = {
  pending: {
    label: 'placed',
    buyer: 'Your order was placed and is awaiting supplier confirmation.',
    supplier: 'A new purchase order needs your review.',
  },
  accepted: {
    label: 'accepted',
    buyer: 'The supplier accepted your order.',
    supplier: 'You accepted this order.',
  },
  rejected: {
    label: 'rejected',
    buyer: 'The supplier rejected your order.',
    supplier: 'You rejected this order.',
  },
  preparing: {
    label: 'being prepared',
    buyer: 'Your order is being prepared.',
    supplier: 'Order moved to preparing.',
  },
  ready_for_pickup: {
    label: 'ready',
    buyer: 'Your order is ready for pickup or dispatch.',
    supplier: 'Order marked ready for pickup.',
  },
  out_for_delivery: {
    label: 'out for delivery',
    buyer: 'Your order is out for delivery.',
    supplier: 'Order dispatched for delivery.',
  },
  delivered: {
    label: 'delivered',
    buyer: 'Your order was delivered. Please confirm to complete it.',
    supplier: 'Order marked delivered.',
  },
  completed: {
    label: 'completed',
    buyer: 'You completed this order.',
    supplier: 'The buyer completed this order.',
  },
  cancelled: {
    label: 'cancelled',
    buyer: 'This order was cancelled.',
    supplier: 'The buyer cancelled this order.',
  },
  disputed: {
    label: 'disputed',
    buyer: 'This order is under dispute.',
    supplier: 'This order has been disputed.',
  },
};
