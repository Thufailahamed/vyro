import {
  DISPATCHABLE_PAYMENT_STATES,
  LIFECYCLE_ERROR_COPY,
  type OrderStatus,
  type PaymentSummary,
  type ReturnReasonCode,
  type ReturnStatus,
} from '@vyro/shared';
import { ApiError, apiBase } from './api';

/* ── Shapes returned by GET /purchase-orders/:id (order-lifecycle API) ── */

export interface OrderLifecycle {
  viewerRole: 'business' | 'supplier' | 'admin';
  allowedTransitions: OrderStatus[];
  disputeWindowEndsAt: number | null;
  returnWindowEndsAt: number | null;
  autoCompleteAt: number | null;
  autoCancelAt: number | null;
  paymentGateEnabled: boolean;
  returnsEnabled: boolean;
}

export type FulfilmentStatus = 'open' | 'accepted' | 'reduced' | 'unavailable';

export interface LifecycleOrderItem {
  id: string;
  productNameSnapshot: string;
  unitPriceCents: number;
  /** Accepted quantity. */
  quantity: number;
  /** Ordered quantity; null means same as `quantity`. */
  requestedQuantity?: number | null;
  fulfilmentStatus?: FulfilmentStatus | null;
  unavailableReason?: string | null;
  lineTotalCents: number;
  discountPctSnapshot?: number | null;
  supplierProductId?: string | null;
}

export interface LifecycleOrderEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: number;
  reason: string | null;
  metadata?: string | null;
}

export interface DeliveryInfo {
  status: string;
  driverName: string | null;
  driverPhone: string | null;
  estimatedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  recipientName: string | null;
  podNote: string | null;
  podCapturedAt: number | null;
  failedReason: string | null;
  hasPodPhoto: boolean;
}

export interface OrderReturnItem {
  id: string;
  purchaseOrderItemId: string;
  productName: string;
  quantity: number;
  approvedQuantity: number | null;
  receivedQuantity: number | null;
  restock: boolean | number | null;
  unitRefundCents: number;
  conditionNote: string | null;
}

export interface OrderReturn {
  id: string;
  rmaNumber: string;
  purchaseOrderId: string;
  businessId: string;
  supplierId: string;
  status: ReturnStatus;
  reasonCode: ReturnReasonCode;
  reasonNote: string | null;
  supplierNote: string | null;
  rejectionReason: string | null;
  refundCents: number | null;
  creditNoteInvoiceId: string | null;
  requestedAt: number;
  decidedAt: number | null;
  receivedAt: number | null;
  refundedAt: number | null;
  createdAt: number;
  updatedAt: number;
  items: OrderReturnItem[];
  attachments: Array<{ id: string; contentType: string; createdAt: number }>;
  poNumber?: string;
}

export interface LifecycleOrderFields {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDistrict: string;
  notes: string | null;
  createdAt: number;
  businessId?: string;
  supplierId?: string;
  originalTotalCents?: number | null;
  partiallyFulfilledAt?: number | null;
  cancelledByRole?: string | null;
  disputeReason?: string | null;
  disputeOutcome?: string | null;
}

export interface LifecycleOrderDetail<O extends LifecycleOrderFields = LifecycleOrderFields> {
  order: O;
  items: LifecycleOrderItem[];
  events: LifecycleOrderEvent[];
  paymentSummary?: PaymentSummary | null;
  delivery?: DeliveryInfo | null;
  returns?: OrderReturn[];
  lifecycle?: OrderLifecycle;
}

/* ── Invoices ── */

export type InvoiceType = 'receipt' | 'tax_invoice' | 'credit_note';

export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  receipt: 'Receipt',
  tax_invoice: 'Tax invoice',
  credit_note: 'Credit note',
};

export function invoiceTypeLabel(type: string): string {
  return INVOICE_TYPE_LABEL[type as InvoiceType] ?? type.replace(/_/g, ' ');
}

/* ── Helpers ── */

/** Human copy for an API failure, preferring the shared lifecycle copy by code. */
export function lifecycleErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === 'NOTHING_TO_ACCEPT') {
      return 'Every line is marked unavailable — reject the order instead.';
    }
    return LIFECYCLE_ERROR_COPY[e.code] ?? e.message ?? fallback;
  }
  return fallback;
}

/** Can the supplier dispatch given the payment gate and current payment state? */
export function canDispatch(lifecycle: OrderLifecycle | undefined, summary: PaymentSummary | null | undefined): boolean {
  if (!lifecycle?.paymentGateEnabled) return true;
  if (!summary) return false;
  return DISPATCHABLE_PAYMENT_STATES.includes(summary.state);
}

/** Multipart POST (the JSON api client always sets a JSON content type). */
export async function postMultipart<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(apiBase + path, { method: 'POST', body: form, credentials: 'include' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? res.statusText,
      body?.error?.details,
    );
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function podPhotoUrl(poId: string): string {
  return `${apiBase}/deliveries/${encodeURIComponent(poId)}/pod`;
}

export function returnAttachmentUrl(returnId: string, attId: string): string {
  return `${apiBase}/returns/${encodeURIComponent(returnId)}/attachments/${encodeURIComponent(attId)}`;
}

export function formatLifecycleDate(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Rough "in 5h 12m" / "in 2d 3h" countdown. */
export function formatCountdown(ts: number, now = Date.now()): string {
  const ms = ts - now;
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${m}m`;
  return `in ${m}m`;
}

/** Quantity of an order line already claimed by live (not rejected/cancelled) returns. */
export function returnedQuantityByItem(returns: OrderReturn[] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of returns ?? []) {
    if (r.status === 'rejected' || r.status === 'cancelled') continue;
    for (const it of r.items) {
      out.set(it.purchaseOrderItemId, (out.get(it.purchaseOrderItemId) ?? 0) + it.quantity);
    }
  }
  return out;
}

/** Status-change events only (delivery-progress rows carry metadata.kind === 'delivery'). */
export function eventKind(e: LifecycleOrderEvent): string | null {
  if (!e.metadata) return null;
  try {
    const m = JSON.parse(e.metadata) as { kind?: string };
    return m?.kind ?? null;
  } catch {
    return null;
  }
}

export function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
