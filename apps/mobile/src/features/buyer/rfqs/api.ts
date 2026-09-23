import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';

/** RFQ shapes — mirrored from apps/web rfq pages + apps/api modules/rfqs. */

export interface RfqRow {
  id: string;
  rfqNumber: string;
  title: string;
  description?: string | null;
  status: string;
  deadline: number | null;
  createdAt: number;
  awardedQuoteId: string | null;
  quoteCount?: number;
  lowestLandedCents?: number | null;
  expiringSoon?: boolean;
  itemCount?: number;
  totalQty?: number;
  isOpen?: boolean;
}

export interface RfqDashboard {
  activeRfqs: number;
  totalRfqs: number;
  quotesReceived: number;
  awarded: number;
  expiringSoon: number;
  negotiationSavingsCents: number;
  avgQuotesPerRfq: number;
  avgMsToFirstQuote: number | null;
  avgMsToAward: number | null;
  rfqToPoConversion: number;
  recent: RfqRow[];
}

export interface RfqItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  targetPriceCents?: number | null;
  specifications?: string | null;
  productId?: string | null;
}

export interface RfqDetailData {
  rfq: {
    id: string;
    rfqNumber: string;
    title: string;
    description?: string | null;
    status: string;
    deadline: number | null;
    deliveryLocation?: string | null;
    paymentTerms?: string | null;
    isOpen?: boolean;
    businessId: string;
    awardedQuoteId?: string | null;
    createdAt: number;
  };
  items: RfqItem[];
  invites?: { supplierId: string; supplierName?: string; status?: string }[];
  events?: { action: string; createdAt: number; toStatus?: string; fromStatus?: string }[];
}

export interface QuoteRow {
  quote: {
    id: string;
    quoteNumber: string;
    status: string;
    version?: number;
    supplierId?: string;
    supplierName?: string | null;
    subtotalCents: number;
    deliveryFeeCents: number;
    taxCents: number;
    discountCents: number;
    totalCents?: number;
    paymentTerms?: string;
    estimatedDeliveryDate?: number;
    validUntil?: number;
  };
  items: {
    id: string;
    rfqItemId: string | null;
    description: string;
    unitPriceCents: number;
    subtotalCents: number;
    isAlternative?: number;
  }[];
  tiers: { quoteItemId: string; minQty: number; unitPriceCents: number }[];
}

export interface CompareQuoteRow {
  quote: QuoteRow['quote'];
  items: QuoteRow['items'];
  tiers: QuoteRow['tiers'];
  supplier: { id: string; name: string; city?: string; pastOrders: number; pastCompleted: number } | null;
  landedCents: number;
  coverage: string;
  isPartial: boolean;
  valid: boolean;
}

export interface CompareData {
  rfq: { rfqNumber: string; title: string };
  items: { id: string; description: string; quantity: number }[];
  quotes: CompareQuoteRow[];
  bestPriceQuoteId: string | null;
  fastestQuoteId: string | null;
  splitOptimization: {
    perItemBest: { rfqItemId: string; quoteId: string; subtotalCents: number }[];
    splitItemsTotalCents: number;
    splitDeliveryCents: number;
    splitLandedEstimateCents: number;
    latestSplitEta: number | null;
    supplierCount: number;
  };
}

export interface RfqMessages {
  messages: { id: string; senderType: string; message: string; createdAt: number }[];
}

/* --------------------------------- queries -------------------------------- */

export function useRfqDashboard(businessId: string | undefined) {
  return useQuery({
    queryKey: ['rfqs', 'dashboard', businessId],
    queryFn: () => api.get<RfqDashboard>('/rfqs/dashboard/business' + qs({ businessId })),
    enabled: !!businessId,
  });
}

export function useRfqList(businessId: string | undefined) {
  return useQuery({
    queryKey: ['rfqs', businessId],
    queryFn: () => api.get<{ rfqs: RfqRow[] }>('/rfqs' + qs({ businessId })),
    enabled: !!businessId,
  });
}

export function useRfqDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['rfq', id],
    queryFn: () => api.get<RfqDetailData>(`/rfqs/${id}`),
    enabled: !!id,
  });
}

export function useRfqQuotes(id: string | undefined) {
  return useQuery({
    queryKey: ['rfq-quotes', id],
    queryFn: () => api.get<{ quotes: QuoteRow[] }>(`/rfqs/${id}/quotes`),
    enabled: !!id,
  });
}

export function useRfqCompare(id: string | undefined) {
  return useQuery({
    queryKey: ['rfq-compare', id],
    queryFn: () => api.get<CompareData>(`/rfqs/${id}/compare`),
    enabled: !!id,
  });
}

export function useRfqAiSummary(id: string | undefined) {
  return useQuery({
    queryKey: ['rfq-ai', id],
    queryFn: () => api.get<{ recommendation: string; bestQuoteId: string | null; summary: string }>(`/rfqs/${id}/ai-summary`),
    enabled: !!id,
    retry: false,
  });
}

export function useRfqMessages(id: string | undefined) {
  return useQuery({
    queryKey: ['rfq-msgs', id],
    queryFn: () => api.get<RfqMessages>(`/rfqs/${id}/messages`),
    enabled: !!id,
  });
}
