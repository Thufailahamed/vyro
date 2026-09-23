import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import type { PaymentState } from '@/lib/orderLifecycle';

export const POLL_MS = 30_000;

/* ---------------------------------- Types --------------------------------- */

export type Po = {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  subtotalCents?: number;
  deliveryFeeCents?: number;
  createdAt: number;
  updatedAt?: number;
  deliveryCity?: string;
  deliveryDistrict?: string;
  deliveryAddress?: string;
  businessId?: string;
  direction?: string;
  currency?: string;
  notes?: string | null;
  rejectionReason?: string | null;
  cancelledReason?: string | null;
  rfqId?: string | null;
  deliveryPromisedAt?: number | null;
  paymentMethod?: string;
  /** Derived payment position (list endpoint). */
  paymentState?: PaymentState | null;
};

export type PoItem = {
  id: string;
  productName?: string;
  productNameSnapshot?: string;
  quantity: number;
  unitPriceCents?: number;
  unitPriceCentsSnapshot?: number;
  discountPctSnapshot?: number;
  totalCents?: number;
  lineTotalCents?: number;
  unit?: string;
};

export type PoEvent = { id: string; fromStatus: string | null; toStatus: string; reason?: string | null; createdAt: number };

export type PoDetail = { order: Po; items: PoItem[]; events: PoEvent[] };

export type Offer = {
  id: string;
  productId?: string;
  active?: boolean;
  availabilityStatus: string;
  minOrderQty?: number;
  leadTimeDays?: number;
  productName?: string;
  productImage?: string | null;
  unitsSold?: number;
  revenueCents?: number;
};

export type Payment = {
  id: string;
  purchaseOrderId: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  method: string;
  status: string;
  transactionReference: string | null;
  createdAt: number;
};

export type Payout = {
  id: string;
  payoutNumber?: string | null;
  amountCents?: number;
  netCents: number;
  status: string;
  method: string;
  periodStart?: number;
  periodEnd?: number;
  reference?: string | null;
  externalReference?: string | null;
  paidAt?: number | null;
  createdAt: number;
};

export type Delivery = {
  id: string;
  purchaseOrderId: string;
  status: string;
  estimatedAt: number | null;
  deliveredAt: number | null;
  driverName: string | null;
  driverPhone?: string | null;
};

export type Customer = { businessId: string; name: string; totalOrders: number; totalCents: number; lastOrderAt?: number };

export type SupplierProfile = {
  id: string;
  name: string;
  city?: string;
  district?: string;
  address?: string;
  description?: string;
  verificationStatus?: string;
  status?: string;
  businessTypeName?: string;
  slug?: string | null;
};

export type SupplierSettings = {
  payoutMethod?: 'bank' | 'cash' | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankBranch?: string | null;
  bankAccountHolder?: string | null;
  bankVerified?: boolean;
  warehouseAddress?: string | null;
  warehouseCity?: string | null;
  warehouseDistrict?: string | null;
  defaultLeadTimeDays?: number | null;
};

/* --------------------------------- Queries -------------------------------- */

export function usePurchaseOrders(supplierId: string, poll = true) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: Po[] }>(`/purchase-orders${qs({ supplierId })}`),
    enabled: !!supplierId,
    refetchInterval: poll ? POLL_MS : false,
  });
}

export function useOffers(supplierId: string) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    enabled: !!supplierId,
    refetchInterval: POLL_MS,
  });
}

export function useSupplierSettings(supplierId: string) {
  return useQuery({
    queryKey: ['supplier-settings', supplierId],
    queryFn: () => api.get<{ settings: SupplierSettings }>(`/suppliers/${supplierId}/settings`),
    enabled: !!supplierId,
  });
}

/* ------------------------------ Order helpers ----------------------------- */

/** Supplier-side next step, identical to the web's NEXT map. */
export const NEXT: Record<string, string | null> = {
  pending: 'accepted',
  accepted: 'preparing',
  preparing: 'ready_for_pickup',
  ready_for_pickup: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

export const NEXT_LABEL: Record<string, string> = {
  accepted: 'Accept PO',
  preparing: 'Start prep',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Dispatch delivery',
  delivered: 'Confirm delivered',
};

/** The lifecycle as shown on the order timeline. */
export const LIFECYCLE = ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'completed'] as const;

export const PENDING_SET = ['pending', 'confirmed', 'accepted', 'preparing', 'ready_for_pickup'];
export const TRANSIT_SET = ['dispatched', 'out_for_delivery', 'shipped'];
export const DONE_SET = ['delivered', 'received', 'completed'];

export function destination(o: Pick<Po, 'deliveryCity' | 'deliveryDistrict'>) {
  return o.deliveryCity ? `${o.deliveryCity}${o.deliveryDistrict ? `, ${o.deliveryDistrict}` : ''}` : 'Commercial dock delivery';
}
