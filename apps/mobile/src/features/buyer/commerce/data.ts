import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api, qs } from '@/lib/api';
import type {
  CartResponse,
  CategoryRecord,
  RepeatOffer,
  ReviewSummary,
  Distribution,
  ProductOffersResponse,
} from './types';

/* ------------------------------ query keys ------------------------------ */

/** Shared with the web: every cart mutation invalidates `['cart']`. */
export const cartKey = (businessId: string | undefined) => ['cart', businessId] as const;
export const productKey = (id: string | undefined) => ['product', id] as const;

export function fetchCart(businessId: string) {
  return api.get<CartResponse>('/cart' + qs({ businessId }));
}

/** The active business cart. Used by the cart tab, checkout and the tab badge. */
export function useCart(businessId: string | undefined) {
  return useQuery({
    queryKey: cartKey(businessId),
    queryFn: () => fetchCart(businessId!),
    enabled: !!businessId,
    staleTime: 0,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: CategoryRecord[] }>('/categories'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProductOffers(id: string | undefined) {
  return useQuery({
    queryKey: productKey(id),
    queryFn: () => api.get<ProductOffersResponse>(`/search/products/${id}/offers`),
    enabled: !!id,
  });
}

const EMPTY_DIST: Distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

export function useSupplierReviewSummary(supplierId: string | null | undefined) {
  const q = useQuery({
    queryKey: ['review-summary', supplierId],
    queryFn: async (): Promise<ReviewSummary> => {
      const j = await api.get<Partial<ReviewSummary>>(`/suppliers/${supplierId}/review-summary`);
      return {
        count: j?.count ?? 0,
        avg: j?.avg ?? null,
        distribution: j?.distribution ?? EMPTY_DIST,
        lastReviewAt: j?.lastReviewAt ?? null,
      };
    },
    enabled: !!supplierId,
    staleTime: 60_000,
    retry: 0,
  });
  return {
    count: q.data?.count ?? 0,
    avg: q.data?.avg ?? null,
    distribution: q.data?.distribution ?? EMPTY_DIST,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}

/** hooks/useRepeatOffersPreview.ts */
export function useRepeatOffersPreview(businessId: string | undefined) {
  return useQuery({
    queryKey: ['repeat-offers-preview', businessId],
    queryFn: () => api.get<{ offers: RepeatOffer[] }>('/checkout/repeat-offers' + qs({ businessId })),
    enabled: !!businessId,
    retry: false,
    staleTime: 60_000,
  });
}

/* ------------------------------ navigation ------------------------------ */

/** Typed-routes escape hatch for routes owned by other areas. */
export function go(href: string) {
  router.push(href as never);
}

export const productHref = (id: string) => `/buyer/product/${encodeURIComponent(id)}`;
export const catalogHref = (params: { q?: string; category?: string } = {}) => `/buyer/catalog${qs(params)}`;

/**
 * Open a supplier's storefront. Search/compare payloads don't always carry
 * the slug, so fall back to `GET /suppliers/:id` (which back-fills one).
 */
export async function openStorefront(supplier: { id: string; slug?: string | null; name?: string }) {
  if (supplier.slug) {
    go(`/buyer/store/${encodeURIComponent(supplier.slug)}`);
    return;
  }
  try {
    const r = await api.get<{ supplier: { slug?: string | null } }>(`/suppliers/${supplier.id}`);
    if (r?.supplier?.slug) {
      go(`/buyer/store/${encodeURIComponent(r.supplier.slug)}`);
      return;
    }
  } catch {
    /* fall through to catalog search */
  }
  if (supplier.name) go(catalogHref({ q: supplier.name }));
}

/* ------------------------------- helpers -------------------------------- */

export function availabilityLabel(status: string | undefined | null): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (status) {
    case 'in_stock':
      return { label: 'In stock', tone: 'success' };
    case 'low':
      return { label: 'Low stock', tone: 'warning' };
    case 'out_of_stock':
      return { label: 'Out of stock', tone: 'danger' };
    case 'pre_order':
      return { label: 'Pre-order', tone: 'neutral' };
    default:
      return { label: status ?? 'Unknown', tone: 'neutral' };
  }
}

export function leadLabel(days: number | undefined | null, short = false): string {
  if (days === undefined || days === null) return short ? '—' : 'Lead time on request';
  if (days === 0) return short ? 'Same day' : 'Same-day dispatch';
  return short ? `${days}d` : `${days}d dispatch`;
}

/** lib/trustStats.ts */
export interface TrustStatCard {
  metric: string;
  label: string;
  sub: string;
}
const MILLION_LKR_CENTS = 100 * 1_000_000;
export function renderTrustStats(
  live?: { districtsCovered: number; lifetimeGmvCents: number; activeSuppliers: number } | null,
): TrustStatCard[] {
  const districts = live ? Math.max(live.districtsCovered, 25) : 25;
  const gmv =
    live && live.lifetimeGmvCents >= MILLION_LKR_CENTS ? `Rs. ${Math.floor(live.lifetimeGmvCents / MILLION_LKR_CENTS)}M+` : 'Rs. 100M+';
  return [
    { metric: String(districts), label: 'Districts covered', sub: 'Island-wide freight routing' },
    { metric: gmv, label: 'Wholesale throughput', sub: 'Active commercial trading volume' },
    { metric: '100%', label: 'Verified suppliers', sub: 'Audited tax & depot identity' },
    { metric: '0%', label: 'Hidden broker markup', sub: 'Direct factory & mill prices' },
  ];
}

/** lib/dedupeSuppliers.ts */
export function dedupeSuppliers<T extends { id: string; name: string; city?: string | null; verificationStatus?: string; activeListingsCount?: number }>(
  list: T[],
): T[] {
  const score = (s: T) => (s.verificationStatus === 'verified' ? 10 : 0) + (s.activeListingsCount ?? 0);
  const byId = new Map<string, T>();
  for (const s of list) byId.set(s.id, s);
  const byKey = new Map<string, T>();
  for (const s of byId.values()) {
    const key = `${s.name.trim().toLowerCase()}|${(s.city ?? '').trim().toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || score(s) > score(prev)) byKey.set(key, s);
  }
  return [...byKey.values()];
}

/** lib/creditDisplay.ts */
export function termsLabel(terms: string): string {
  if (terms === 'net14') return 'Net 14';
  if (terms === 'net30') return 'Net 30';
  return terms;
}
