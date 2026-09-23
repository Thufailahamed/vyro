import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';

export type AdminOrderItem = {
  id: string;
  purchaseOrderId: string;
  supplierProductId: string;
  productNameSnapshot: string;
  unitPriceCents: number;
  unitPriceCentsSnapshot?: number;
  discountPctSnapshot?: number;
  quantity: number;
  lineTotalCents: number;
};

export type AdminOrderEvent = {
  id: string;
  purchaseOrderId: string;
  actorUserId?: string | null;
  fromStatus?: string | null;
  toStatus: string;
  reason?: string | null;
  metadata?: string | null;
  createdAt: number;
};

export type OrderDirection = 'domestic' | 'export' | 'import';

export type AdminOrder = {
  id: string;
  poNumber?: string;
  status: string;
  direction?: OrderDirection | null;
  incoterms?: string | null;
  fxSnapshotId?: string | null;
  declaredShippingCostCents?: number | null;
  declaredDutyCents?: number | null;
  commercialInvoiceNo?: string | null;
  customsStatus?: string | null;
  wireRef?: string | null;
  wireReceivedAmountCents?: number | null;
  wireReceivedCurrency?: string | null;
  wireReceivedAt?: number | null;
  businessId?: string;
  supplierId?: string;
  subtotalCents?: number;
  deliveryFeeCents?: number;
  totalCents?: number;
  currency?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryDistrict?: string;
  notes?: string | null;
  rejectionReason?: string | null;
  cancelledReason?: string | null;
  createdByUserId?: string;
  acceptedAt?: number | null;
  rejectedAt?: number | null;
  preparedAt?: number | null;
  readyAt?: number | null;
  dispatchedAt?: number | null;
  deliveredAt?: number | null;
  completedAt?: number | null;
  cancelledAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  businessName?: string | null;
  businessCity?: string | null;
  businessCountryCode?: string | null;
  businessContactPerson?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  businessAddress?: string | null;
  supplierName?: string | null;
  supplierCity?: string | null;
  supplierCountryCode?: string | null;
  supplierContactPerson?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  supplierAddress?: string | null;
};

export interface AdminOrdersFilter {
  status?: string;
  q?: string;
  direction?: OrderDirection;
  limit?: number;
}

/** Same endpoint and query key shape as the web's useAdminOrders. */
export function useAdminOrders(filter: AdminOrdersFilter) {
  const status = filter.status && filter.status !== 'all' ? filter.status : undefined;
  const q = filter.q?.trim() || undefined;
  return useQuery({
    queryKey: ['admin-orders', status ?? 'all', q ?? '', filter.direction ?? '', filter.limit ?? 50],
    queryFn: () => api.get<{ orders: AdminOrder[] }>('/admin/orders' + qs({ status, q, direction: filter.direction, limit: filter.limit })),
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => api.get<{ order: AdminOrder; items?: AdminOrderItem[]; events?: AdminOrderEvent[] }>(`/admin/orders/${id}`),
    enabled: Boolean(id),
  });
}

export const ORDER_STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready_for_pickup', label: 'Ready' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed', label: 'Disputed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'rejected', label: 'Rejected' },
] as const;

export const OVERRIDE_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
  'disputed',
] as const;
