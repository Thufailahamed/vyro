import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api, qs } from '@/lib/api';
import type { Tone } from '@/theme/tokens';

/* --------------------------------- Types ---------------------------------- */

export type Availability = 'in_stock' | 'low' | 'out_of_stock';

/** A supplier's offer on a catalog product (`/supplier-products/by-supplier/:id`). */
export interface Offer {
  id: string;
  productId: string;
  supplierSku: string | null;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
  deliveryAvailable?: boolean;
  deliveryRadiusKm?: number | null;
  availabilityStatus: Availability;
  active: boolean;
  tier1MinQty?: number;
  tier1DiscountPct?: number;
  tier2MinQty?: number;
  tier2DiscountPct?: number;
  tier3MinQty?: number;
  tier3DiscountPct?: number;
  stockQty?: number;
  reservedQty?: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
  availableQty?: number | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  unit?: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
  categoryId?: string;
  category?: string | null;
  hsCode?: string | null;
  countryOfOrigin?: string | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export interface StockMovement {
  id: string;
  reason: string;
  qtyDelta: number;
  reservedDelta: number;
  stockQtyAfter: number;
  reservedQtyAfter: number;
  note: string | null;
  createdAt: number;
  purchaseOrderId: string | null;
}

export interface OnboardingGate {
  required: boolean;
  missing: { slug: string; title: string }[];
}

/* ------------------------------ Query keys -------------------------------- */

export const offersKey = (supplierId: string | undefined) => ['supplier', supplierId, 'offers'] as const;
export const catalogKey = ['products', 'catalog'] as const;

/* -------------------------------- Queries --------------------------------- */

export function useOffers(supplierId: string | undefined) {
  return useQuery({
    queryKey: offersKey(supplierId),
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    enabled: !!supplierId,
    refetchInterval: 30_000,
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: catalogKey,
    queryFn: () => api.get<{ products: CatalogProduct[] }>('/products?limit=500'),
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/categories'),
    staleTime: 5 * 60_000,
  });
}

export function useCatalogProduct(productId: string | null | undefined) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.get<{ product: CatalogProduct & { unit: string; categoryId: string }; images: { id: string; url: string }[] }>(`/products/${productId}`),
    enabled: !!productId,
  });
}

export function useOnboardingGate(supplierId: string | undefined) {
  return useQuery({
    queryKey: supplierId ? ['learning', 'gate', supplierId] : ['learning', 'gate', 'none'],
    queryFn: () => api.get<OnboardingGate>(`/supplier/learning/gate${qs({ supplierId })}`),
    enabled: !!supplierId,
    retry: false,
  });
}

/* -------------------------------- Helpers --------------------------------- */

export const AVAIL_LABEL: Record<Availability, string> = {
  in_stock: 'In stock',
  low: 'Low stock',
  out_of_stock: 'Out of stock',
};

export const AVAIL_TONE: Record<Availability, Tone> = {
  in_stock: 'success',
  low: 'warning',
  out_of_stock: 'danger',
};

export const AVAIL_ORDER: Availability[] = ['in_stock', 'low', 'out_of_stock'];

export function hasTiers(o: Pick<Offer, 'tier1DiscountPct' | 'tier2DiscountPct' | 'tier3DiscountPct'>): boolean {
  return (o.tier1DiscountPct ?? 0) > 0 || (o.tier2DiscountPct ?? 0) > 0 || (o.tier3DiscountPct ?? 0) > 0;
}

export function productMeta(p?: Pick<CatalogProduct, 'brand' | 'packSize' | 'unit'> | null): string {
  if (!p) return '';
  return [p.brand, p.packSize, p.unit].filter(Boolean).join(' · ');
}

/** True when a tracked offer's free stock is at or under its low-stock threshold. */
export function isRunningLow(o: Offer): boolean {
  if (o.availabilityStatus === 'low') return true;
  if (!o.trackInventory) return false;
  const free = o.availableQty ?? o.stockQty ?? 0;
  const thr = o.lowStockThreshold ?? 0;
  return thr > 0 && free <= thr && free > 0;
}

export function matchesSearch(o: Offer, p: CatalogProduct | undefined, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return !!(p?.name.toLowerCase().includes(s) || o.supplierSku?.toLowerCase().includes(s) || p?.brand?.toLowerCase().includes(s));
}

/** Parse an LKR text value to integer cents (0 when invalid). */
export function lkrToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/,/g, ''));
  if (Number.isNaN(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** Typed-routes-safe navigation helper for this area. */
export function go(path: string) {
  router.push(path as never);
}
