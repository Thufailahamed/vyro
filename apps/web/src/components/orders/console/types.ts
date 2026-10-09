import type { OrderReturn } from '@/lib/orderLifecycle';

export interface ConsoleOrder {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
  deliveryCity?: string;
  deliveryDistrict?: string;
  businessId?: string;
  paymentState?: string | null;
  returnState?: string | null;
}

export type ConsoleOrderDetail = {
  order: ConsoleOrder;
  items: Array<{
    id: string;
    productName?: string;
    productNameSnapshot?: string;
    quantity: number;
    unitPriceCents?: number;
    unitPriceCentsSnapshot?: number;
    totalCents?: number;
    lineTotalCents?: number;
    unit?: string;
  }>;
  events: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    createdAt: number;
  }>;
  returns?: OrderReturn[];
};

export type QueueTab = 'all' | 'incoming' | 'fulfillment' | 'completed';

/** Left-edge status spine color for an order row. */
const STATUS_SPINE: Record<string, string> = {
  pending: '#C4843A', // amber — action needed
  accepted: '#3D8B6E', // mint
  preparing: '#7A8F22', // volt-deep
  ready_for_pickup: '#7A8F22',
  out_for_delivery: '#B87A4E', // copper
  delivered: '#A4A89E', // ink-5
  completed: '#A4A89E',
  rejected: '#C45A4A', // rose
  cancelled: '#D4D0C6', // ink-6
  disputed: '#C45A4A',
};

export function statusSpine(status: string): string {
  return STATUS_SPINE[status] ?? '#D4D0C6';
}
