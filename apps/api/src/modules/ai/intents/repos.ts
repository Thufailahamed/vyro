/**
 * Adapter interface for AI intent handlers.
 *
 * Handlers receive an `AiRepos` instance instead of touching Drizzle directly.
 * Production wires `drizzleRepos(env)`. Tests pass mocks. Keeps handlers pure
 * and testable without a D1 stub.
 */

export interface ProductRow {
  id: string;
  name: string;
  categoryId: string;
  unit: string;
  packSize?: string | null;
}

export interface OfferRow {
  id: string;
  supplierId: string;
  productId: string;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
  deliveryAvailable: boolean;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  active: boolean;
}

export interface SupplierRow {
  id: string;
  name: string;
}

export interface PoRow {
  id: string;
  businessId: string;
  supplierId: string;
  status: string;
  totalCents: number;
  createdAt: number;
}

export interface PoItemRow {
  id: string;
  purchaseOrderId: string;
  productId: string;
  supplierId: string;
  quantity: number;
  unitPriceCents: number;
  createdAt: number;
}

export interface AiRepos {
  searchProducts(q: string, limit?: number): Promise<Array<ProductRow & { bestOffer: (OfferRow & { supplier: SupplierRow }) | null; offerCount: number }>>;
  findProductByName(name: string): Promise<ProductRow | null>;
  listOffersByProduct(productId: string): Promise<Array<OfferRow & { supplier: SupplierRow }>>;
  listSupplierProducts(opts: { productName?: string; supplierName?: string; active?: boolean }): Promise<Array<{ supplierName: string; supplierId: string; leadTimeDays: number; deliveryAvailable: boolean; deliveryRadiusKm: number | null; priceCents: number; availabilityStatus: string }>>;
  listRecentPoItems(opts: { businessId: string; sinceMs: number }): Promise<PoItemRow[]>;
  listPosForSupplier(opts: { businessId: string; supplierIds: string[] }): Promise<PoRow[]>;
  spendInPeriod(opts: { businessId: string; sinceMs: number }): Promise<{ totalCents: number; orderCount: number }>;
  spendForProduct(opts: { businessId: string; sinceMs: number; productName: string }): Promise<number>;
  spendForSupplier(opts: { businessId: string; sinceMs: number; supplierName: string }): Promise<number>;
  savingsOpportunities(opts: { businessId: string; sinceMs: number }): Promise<Array<{
    productName: string;
    currentSupplierName: string;
    currentPriceCents: number;
    alternativeSupplierName: string;
    alternativePriceCents: number;
    savingCents: number;
  }>>;
  recentPoItemsForRecurrence(opts: { businessId: string; sinceMs: number }): Promise<PoItemRow[]>;
  recentPoItemsForReorder(opts: { businessId: string; sinceMs: number }): Promise<PoItemRow[]>;
  priceChangeMovers(opts: { businessId: string; sinceMs: number }): Promise<Array<{ productName: string; from: number; to: number; pct: number }>>;
  listProductNames(limit?: number): Promise<string[]>;
  listSupplierNames(limit?: number): Promise<string[]>;
  /** Batch-resolve product ids to display names. Missing ids are omitted. */
  productNamesByIds(ids: string[]): Promise<Map<string, string>>;
  /** Top products purchased by the business in the last 30 days, ranked by line count. */
  topProductsLast30d(opts: { businessId: string; limit: number }): Promise<Array<{ name: string; count: number }>>;
  /** Top intents invoked by the business in the last 30 days, ranked by frequency. */
  topIntentsLast30d(opts: { businessId: string; limit: number }): Promise<Array<{ intent: string; count: number }>>;
}
