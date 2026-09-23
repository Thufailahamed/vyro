/** API shapes for purchase orders — mirrored from apps/web + apps/api. */

export interface OrderRow {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  status: string;
  direction?: 'domestic' | 'export' | 'import';
  totalCents: number;
  currency: string;
  createdAt: number;
}

export interface OrderDetail {
  order: {
    id: string;
    poNumber: string;
    status: string;
    businessId: string;
    supplierId: string;
    direction: 'domestic' | 'export' | 'import';
    paymentMethod: 'payhere' | 'wire';
    totalCents: number;
    subtotalCents: number;
    deliveryFeeCents?: number;
    currency?: string;
    deliveryAddress: string;
    deliveryCity: string;
    deliveryDistrict: string;
    notes: string | null;
    rejectionReason?: string | null;
    cancelledReason?: string | null;
    rfqId?: string | null;
    acceptedAt?: number | null;
    preparedAt?: number | null;
    readyAt?: number | null;
    dispatchedAt?: number | null;
    deliveredAt?: number | null;
    completedAt?: number | null;
    cancelledAt?: number | null;
    disputedAt?: number | null;
    createdAt: number;
  };
  items: {
    id: string;
    productNameSnapshot: string;
    quantity: number;
    unitPriceCents: number;
    discountPctSnapshot?: number | null;
    lineTotalCents: number;
  }[];
  events: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    createdAt: number;
    reason: string | null;
  }[];
}

export interface Payment {
  id: string;
  purchaseOrderId: string;
  method: 'cash' | 'bank_transfer' | 'online';
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'chargeback' | 'refunded';
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  transactionReference: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
  notes: string | null;
  createdAt: number;
}

export interface Delivery {
  id: string;
  purchaseOrderId: string;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
  driverName: string | null;
  driverPhone: string | null;
  estimatedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface InvoiceRow {
  id: string;
  number: string;
  type: 'receipt' | 'tax_invoice';
  purchaseOrderId: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  issuedAt: number;
  dueAt: number | null;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitCents: number;
  lineTotalCents: number;
}

export interface WireInstructions {
  poId: string;
  poNumber: string;
  paymentMethod: 'wire';
  totalLkrCents: number;
  equivalents: { currency: string; amountCents: number; rateScaled: string; fetchedAt: number }[];
  beneficiary: {
    name: string;
    address?: string;
    bankName: string;
    bankAddress?: string;
    accountNumber: string;
    swiftBic: string;
    iban?: string;
    intermediaryName?: string;
    intermediarySwift?: string;
    reference: string;
    memo: string;
  };
  initiatedAt: number;
}

export interface ReconciliationLine {
  poItemId?: string;
  description: string;
  poQuantity?: number;
  billedQuantity?: number;
  poUnitPriceCents?: number;
  billedUnitPriceCents?: number;
  status: 'matched' | 'price_variance' | 'quantity_variance' | 'unexpected_item' | 'missing_item';
  varianceCents: number;
  discrepancyReason?: string;
}

export interface ReconciliationResult {
  status: 'perfect_match' | 'discrepancy_detected' | 'critical_mismatch';
  matchConfidence: number;
  poTotalCents: number;
  invoiceTotalCents: number;
  netDifferenceCents: number;
  isDeliveryConfirmed: boolean;
  summary: string;
  recommendedAction: 'approve_payment' | 'request_amendment' | 'file_claim';
  draftClaimNote?: string;
  lines: ReconciliationLine[];
}

export interface PoMessage {
  id: string;
  purchaseOrderId: string;
  senderUserId: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}

export interface ReorderToCartResponse {
  cartId: string;
  addedCount: number;
  skippedCount: number;
  addedSubtotalCents: number;
}

export interface ReorderPoResponse {
  poIds: string[];
  skipped: { supplierProductId: string; reason: string }[];
}
