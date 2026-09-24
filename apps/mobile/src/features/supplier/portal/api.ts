import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import type { LifecycleDetailFields, LifecycleItemFields, LifecycleOrderFields } from '@/lib/orderLifecycle';

/* Shared supplier-portal types + hooks. Endpoints mirror apps/web supplier pages. */

export type SupplierProfile = {
  id: string;
  name: string;
  city?: string | null;
  district?: string | null;
  verificationStatus?: string | null;
  status?: string | null;
  slug?: string | null;
};

export type Po = {
  id: string;
  poNumber?: string;
  status: string;
  totalCents: number;
  createdAt: number;
  deliveryCity?: string;
  deliveryDistrict?: string;
};

export type PoDetail = LifecycleDetailFields & {
  order: Po &
    LifecycleOrderFields & {
      notes?: string | null;
      rejectionReason?: string | null;
      cancelledReason?: string | null;
      deliveryAddress?: string | null;
      businessId?: string | null;
      updatedAt?: number;
    };
  items: ({
    id: string;
    productName?: string;
    productNameSnapshot?: string;
    quantity: number;
    unitPriceCents?: number;
    unitPriceCentsSnapshot?: number;
    totalCents?: number;
    lineTotalCents?: number;
    unit?: string;
  } & LifecycleItemFields)[];
  events: { id: string; fromStatus: string | null; toStatus: string; reason?: string | null; metadata?: string | null; createdAt: number }[];
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
  reference?: string | null;
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

export type Customer = {
  businessId: string;
  name: string;
  totalOrders: number;
  totalCents: number;
  lastOrderAt?: number | null;
};

export type RfqInvite = {
  rfq: { id: string; rfqNumber: string; title: string; status: string; deadline: number | null; deliveryLocation?: string; requiredDeliveryDate?: number | null };
  itemCount: number;
  myQuotes: number;
  myStatus: string | null;
  inviteStatus?: string | null;
  expiringSoon: boolean;
};

export type SupplierRfqDashboard = {
  rfqsReceived: number;
  quotesSubmitted: number;
  won: number;
  lost: number;
  winRate: number;
  responseRate: number;
  avgMsToRespond: number | null;
};

export function useSupplierRfqDashboard(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'rfq-dashboard'],
    queryFn: () => api.get<SupplierRfqDashboard>(`/rfqs/dashboard/supplier${qs({ supplierId })}`),
    enabled: !!supplierId,
    retry: false,
  });
}

// Mirrors LeadRow/LeadNoteRow/LeadsListResult in packages/validation/src/rfqCrm.ts.
// Mobile cannot import @vyro/validation (see permissions.ts note) — keep in sync.
export type LeadTag = 'hot' | 'warm' | 'cold';
export type LeadConversionStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

export type Lead = {
  id: string;
  rfqId: string;
  supplierId: string;
  status: string;
  invitedAt: number;
  tag: LeadTag | null;
  conversionStatus: LeadConversionStatus | null;
  quotedAt: number | null;
  orderId: string | null;
  orderValueCents: number | null;
  buyerBusinessId: string;
  buyerName: string;
  buyerKycLevel: 'none' | 'basic' | 'enhanced';
  buyerVerifiedAt: number | null;
  buyerVerified: boolean;
};

export type LeadNote = {
  id: string;
  rfqSupplierId: string;
  body: string;
  createdBy: string;
  createdAt: number;
};

export type LessonSummary = {
  slug: string;
  title: string;
  track?: string | null;
  required?: boolean;
  completed?: boolean;
  durationMinutes?: number | null;
};

export type LessonDetail = LessonSummary & {
  body?: string | null;
  content?: string | null;
  quiz?: { id: string; question: string; options: { id: string; label: string }[] }[];
};

export type SponsorPlan = { id: string; name: string; monthlyRateCents: number; includedSlotCredits: number; active: boolean };
export type SponsorSubscription = { id: string; planId?: string; status: string; currentPeriodEnd?: number | null; createdAt?: number };
export type SponsorSlot = { id: string; surface: string; position: number; label: string; dailyRateCents: number; active?: boolean };
export type SponsorCampaign = { id: string; slotId: string; status: string; startsAt: number; endsAt: number; adminNotes?: string | null };
export type SponsorInvoice = { id: string; amountCents: number; status: string; createdAt: number };

export type SupplierAnalytics = {
  metrics: { revenueCents: number; ordersCount: number; avgOrderValueCents: number; repeatCustomerRate: number; lowStockCount: number; avgLeadTimeDays: number };
  revenueTrend: { day: string; cents: number }[];
  ordersByDay: { day: string; count: number }[];
  topProducts: { productId: string; name: string; revenueCents: number; units: number }[];
};

export const POLL_MS = 30_000;

export function useSupplierProfile(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'profile'],
    queryFn: () => api.get<{ supplier: SupplierProfile }>(`/suppliers/${supplierId}`),
    enabled: !!supplierId,
    refetchInterval: POLL_MS,
  });
}

export function useSupplierPayments(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'payments'],
    queryFn: () => api.get<{ items: Payment[] }>(`/payments${qs({ supplierId })}`),
    enabled: !!supplierId,
    refetchInterval: POLL_MS,
  });
}

export function useSupplierPayouts(supplierId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'payouts'],
    queryFn: () => api.get<{ items: Payout[] }>(`/payouts${qs({ supplierId })}`),
    enabled: !!supplierId && enabled,
  });
}

export function useSupplierBalance(supplierId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'balance'],
    queryFn: () => api.get<{ balanceCents: number }>(`/accounts/balance${qs({ accountType: 'supplier', accountId: supplierId })}`),
    enabled: !!supplierId && enabled,
  });
}

export function useSupplierDeliveries(supplierId: string | undefined, status = 'all') {
  return useQuery({
    queryKey: ['supplier', supplierId, 'deliveries', status],
    queryFn: () => api.get<{ items: Delivery[] }>(`/deliveries${qs({ supplierId, status: status === 'all' ? undefined : status })}`),
    enabled: !!supplierId,
    refetchInterval: POLL_MS,
  });
}

export function useSupplierCustomers(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: () => api.get<{ items: Customer[] }>(`/suppliers/${supplierId}/customers?limit=100`),
    enabled: !!supplierId,
  });
}

export function useSupplierRfqs(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'rfqs'],
    queryFn: () => api.get<{ rfqs: RfqInvite[] }>(`/rfqs/supplier/list${qs({ supplierId })}`),
    enabled: !!supplierId,
    refetchInterval: POLL_MS,
  });
}

export function useSupplierLeads(supplierId: string | undefined, tag?: string | null, status?: string | null) {
  return useInfiniteQuery({
    queryKey: ['crm-leads', supplierId, tag ?? null, status ?? null],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: { leads: Lead[]; nextCursor: string | null }) => lastPage.nextCursor ?? undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.get<{ leads: Lead[]; nextCursor: string | null }>(
        `/supplier/crm/leads${qs({ supplierId, limit: 50, cursor: pageParam, tag: tag ?? undefined, status: status ?? undefined })}`,
      ),
    enabled: !!supplierId,
  });
}

export function useSupplierLead(supplierId: string | undefined, leadId: string | undefined) {
  return useQuery({
    queryKey: ['crm-lead', supplierId, leadId],
    queryFn: () => api.get<{ lead: Lead }>(`/supplier/crm/leads/${leadId}${qs({ supplierId })}`),
    enabled: !!supplierId && !!leadId,
  });
}

export function useSupplierLeadNotes(supplierId: string | undefined, leadId: string | undefined) {
  return useQuery({
    queryKey: ['crm-lead-notes', supplierId, leadId],
    queryFn: () =>
      api.get<{ notes: LeadNote[]; nextCursor: string | null }>(
        `/supplier/crm/leads/${leadId}/notes${qs({ supplierId, limit: 30 })}`,
      ),
    enabled: !!supplierId && !!leadId,
  });
}

export function useSetLeadTag(supplierId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leadId: string; tag: string | null }) =>
      api.patch<{ tag: string | null }>(`/supplier/crm/leads/${input.leadId}/tag${qs({ supplierId })}`, {
        tag: input.tag,
      }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['crm-leads', supplierId] });
      void qc.invalidateQueries({ queryKey: ['crm-lead', supplierId, v.leadId] });
      void qc.invalidateQueries({ queryKey: ['crm-summary', supplierId] });
    },
  });
}

export function useSetLeadStatus(supplierId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leadId: string; status: string }) =>
      api.patch<{ status: string }>(`/supplier/crm/leads/${input.leadId}/status${qs({ supplierId })}`, {
        status: input.status,
      }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['crm-leads', supplierId] });
      void qc.invalidateQueries({ queryKey: ['crm-lead', supplierId, v.leadId] });
      void qc.invalidateQueries({ queryKey: ['crm-summary', supplierId] });
    },
  });
}

export function useAddLeadNote(supplierId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leadId: string; body: string }) =>
      api.post<{ note: LeadNote }>(`/supplier/crm/leads/${input.leadId}/notes${qs({ supplierId })}`, {
        body: input.body,
      }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['crm-lead-notes', supplierId, v.leadId] });
    },
  });
}

export function useCrmSummary(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['crm-summary', supplierId],
    queryFn: () =>
      api.get<{
        byTag: { hot: number; warm: number; cold: number; untagged: number };
        byStatus: { new: number; contacted: number; quoted: number; won: number; lost: number };
        totals: { leads: number; conversionRate: number };
      }>(`/supplier/crm/summary${qs({ supplierId })}`),
    enabled: !!supplierId,
  });
}

export function useSupplierAnalytics(supplierId: string | undefined, range: '7d' | '30d' | '90d') {
  return useQuery({
    queryKey: ['supplier', supplierId, 'analytics', range],
    queryFn: () => api.get<SupplierAnalytics>(`/analytics/supplier${qs({ supplierId, range })}`),
    enabled: !!supplierId,
    retry: false,
  });
}

export function useSupplierLessons(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['learning', 'list', supplierId],
    queryFn: () => api.get<{ lessons: LessonSummary[] }>(`/supplier/learning${qs({ supplierId })}`),
    enabled: !!supplierId,
  });
}

export function useSupplierLesson(supplierId: string | undefined, slug: string | undefined) {
  return useQuery({
    queryKey: ['learning', 'detail', supplierId, slug],
    queryFn: () => api.get<LessonDetail>(`/supplier/learning/${encodeURIComponent(slug ?? '')}${qs({ supplierId })}`),
    enabled: !!supplierId && !!slug,
  });
}

export function useSponsorPlans() {
  return useQuery({ queryKey: ['sponsored', 'plans'], queryFn: () => api.get<SponsorPlan[]>(`/supplier/sponsored/plans`) });
}

export function useSponsorSubscription(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['sponsored', 'subscription', supplierId],
    queryFn: () => api.get<SponsorSubscription | null>(`/supplier/sponsored/subscriptions/me${qs({ supplierId })}`),
    enabled: !!supplierId,
  });
}

export function useSponsorSlots(supplierId: string | undefined, surface = 'search') {
  return useQuery({
    queryKey: ['sponsored', 'slots', surface, supplierId],
    queryFn: () => api.get<SponsorSlot[]>(`/supplier/sponsored/slots${qs({ surface, supplierId })}`),
    enabled: !!supplierId,
  });
}

export function useSponsorCampaigns(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['sponsored', 'campaigns', supplierId],
    queryFn: () => api.get<SponsorCampaign[]>(`/supplier/sponsored/campaigns${qs({ supplierId })}`),
    enabled: !!supplierId,
  });
}

export function useSponsorInvoices(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['sponsored', 'invoices', supplierId],
    queryFn: () => api.get<SponsorInvoice[]>(`/supplier/sponsored/invoices${qs({ supplierId })}`),
    enabled: !!supplierId,
  });
}

export function usePoDetail(poId: string | undefined) {
  return useQuery({
    queryKey: ['purchase-order', poId],
    // `as=supplier` so `lifecycle.allowedTransitions` is computed for the supplier side.
    queryFn: () => api.get<PoDetail>(`/purchase-orders/${poId}?as=supplier`),
    enabled: !!poId,
  });
}

export function settledRevenue(payments: Payment[]): number {
  return payments.filter((p) => p.status === 'completed' || p.status === 'paid').reduce((s, p) => s + (p.amountCents ?? 0), 0);
}
