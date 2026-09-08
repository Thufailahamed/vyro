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
  /**
   * NL-aware search. Wraps searchProducts() with post-fetch filters + sort.
   * `priceMaxCents` and `availableWithinDays` are enforced on live offers.
   * `supplierName`, `categorySlug`, `brand` are accepted for handler-level
   * filtering and reporting; DB-level pre-filtering is a phase-5+ concern.
   */
  searchProductsFiltered(opts: {
    query?: string;
    priceMaxCents?: number;
    availableWithinDays?: number;
    categorySlug?: string;
    brand?: string;
    supplierName?: string;
    sort?: 'price_asc' | 'lead_asc' | 'recommended';
    limit?: number;
  }): Promise<Array<ProductRow & { bestOffer: (OfferRow & { supplier: SupplierRow }) | null; offerCount: number; matchedOffers?: Array<OfferRow & { supplier: SupplierRow }> }>>;
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
  /** Distinct business ids with at least one active member. Used by the
   *  scheduled insights worker to fan out without scanning the whole table. */
  listActiveBusinessIds(): Promise<string[]>;
  recentPoItemsForRecurrence(opts: { businessId: string; sinceMs: number }): Promise<PoItemRow[]>;
  recentPoItemsForReorder(opts: { businessId: string; sinceMs: number }): Promise<PoItemRow[]>;
  /**
   * Reorder cadence for one product across the business's purchase history.
   * Returns null when fewer than 3 distinct purchase timestamps exist (signal
   * too weak to surface a stable hint). Otherwise returns average and stddev
   * of the gaps between consecutive purchases, in days.
   */
  poItemCadence(opts: { businessId: string; productId: string; sinceMs: number }): Promise<{ avgIntervalDays: number; stddevDays: number; count: number; minIntervalDays: number; maxIntervalDays: number } | null>;
  priceChangeMovers(opts: { businessId: string; sinceMs: number }): Promise<Array<{ productName: string; from: number; to: number; pct: number }>>;
  listProductNames(limit?: number): Promise<string[]>;
  listSupplierNames(limit?: number): Promise<string[]>;
  /** Batch-resolve product ids to display names. Missing ids are omitted. */
  productNamesByIds(ids: string[]): Promise<Map<string, string>>;
  /** Top products purchased by the business in the last 30 days, ranked by line count. */
  topProductsLast30d(opts: { businessId: string; limit: number }): Promise<Array<{ name: string; count: number }>>;
  /** Top intents invoked by the business in the last 30 days, ranked by frequency. */
  topIntentsLast30d(opts: { businessId: string; limit: number }): Promise<Array<{ intent: string; count: number }>>;
  /**
   * One row per product representing the cheapest live offer across the
   * whole catalog. Used for "find cheapest suppliers" with no productName —
   * returns the products whose best live offer is cheapest in absolute terms.
   * Out-of-stock offers are skipped; ties broken by offerCount desc, then
   * productName asc for stable ordering.
   */
  topCheapestOffers(opts: { limit: number }): Promise<Array<{
    productId: string;
    productName: string;
    supplierId: string;
    supplierName: string;
    priceCents: number;
    leadTimeDays: number;
    deliveryAvailable: boolean;
    minOrderQty: number;
    availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
    offerCount: number;
  }>>;
  /**
   * Create a draft purchase order from AI-recommended items. Idempotent on
   * `idempotencyKey`: replays return the same poRef and estimatedDelivery.
   * Caller must validate role + tenant scope.
   */
  createDraftFromRecommendation(input: {
    businessId: string;
    userId: string;
    items: Array<{ product: string; quantity: number; unit: string; priceCents: number; supplier: string }>;
    idempotencyKey: string;
  }): Promise<{ poRef: string; estimatedDelivery: string }>;
  priceWindows(opts: { businessId: string; productId: string; recentSince: number; priorSince: number; priorUntil: number }): Promise<{ recentAvg: number; recentN: number; priorAvg: number; priorN: number }>;
  lastBuyPrices(opts: { businessId: string; productId: string; limit: number }): Promise<number[]>;
  supplierLifecycle(opts: { businessId: string; sinceMs: number }): Promise<Array<{ supplierId: string; supplierName: string; total: number; accepted: number; rejected: number; cancelled: number; delivered: number }>>;
  categorySpend(opts: { businessId: string; sinceMs: number }): Promise<Array<{ category: string; totalCents: number }>>;
  /** Categorized expense breakdown from reviewed invoice line items. */
  expenseCategoryBreakdown(businessId: string, months: number): Promise<Array<{ slug: string | null; total: number }>>;
  monthlySpend(opts: { businessId: string; months: number }): Promise<number[]>;
  concentration(opts: { businessId: string; sinceMs: number }): Promise<Array<{ supplierId: string; supplierName: string; share: number }>>;
}
