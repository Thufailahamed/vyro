import type { AiRepos, OfferRow, PoItemRow, ProductRow, SupplierRow } from '../../../src/modules/ai/intents/repos';

/**
 * Build a mock AiRepos from in-memory seed data. Used by intent handler tests.
 */
export function mockRepos(input: {
  products?: Array<ProductRow>;
  offers?: Array<OfferRow & { supplier: SupplierRow }>;
  pos?: Array<{ id: string; businessId: string; supplierId: string; status: string; totalCents: number; createdAt: number }>;
  poItems?: Array<PoItemRow & { productName?: string }>;
}): AiRepos {
  const products = input.products ?? [];
  const offers = input.offers ?? [];
  const pos = input.pos ?? [];
  const poItems = input.poItems ?? [];

  const productByName = (name: string) =>
    products.find((p) => p.name.toLowerCase().includes(name.toLowerCase())) ?? null;
  const offersFor = (productId: string) =>
    offers.filter((o) => o.productId === productId);
  const supplierName = (id: string) => offers.find((o) => o.supplierId === id)?.supplier.name ?? '—';

  const listRecentPoItems = async ({ businessId, sinceMs }: { businessId: string; sinceMs: number }) => {
    const poIds = new Set(pos.filter((p) => p.businessId === businessId && p.createdAt >= sinceMs).map((p) => p.id));
    return poItems.filter((it) => poIds.has(it.purchaseOrderId));
  };

  return {
    async searchProducts(q, limit = 20) {
      return products
        .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
        .slice(0, limit)
        .map((p) => {
          const live = offersFor(p.id).filter((o) => o.availabilityStatus !== 'out_of_stock');
          const best = live.slice().sort((a, b) => a.priceCents - b.priceCents)[0] ?? null;
          return { ...p, bestOffer: best, offerCount: live.length };
        });
    },
    async findProductByName(name) {
      return productByName(name);
    },
    async listOffersByProduct(productId) {
      return offersFor(productId);
    },
    async listSupplierProducts({ productName, supplierName: sName, active = true }) {
      let rows = offers.filter((o) => active ? o.active : true);
      if (productName) {
        const p = productByName(productName);
        if (!p) return [];
        rows = rows.filter((o) => o.productId === p.id);
      }
      if (sName) rows = rows.filter((o) => o.supplier.name.toLowerCase().includes(sName.toLowerCase()));
      return rows.map((o) => ({
        supplierName: o.supplier.name,
        supplierId: o.supplier.id,
        leadTimeDays: o.leadTimeDays,
        deliveryAvailable: o.deliveryAvailable,
        deliveryRadiusKm: null,
        priceCents: o.priceCents,
        availabilityStatus: o.availabilityStatus,
      }));
    },
    async listRecentPoItems(opts) {
      return listRecentPoItems(opts);
    },
    async listPosForSupplier({ businessId, supplierIds }) {
      return pos.filter((p) => p.businessId === businessId && supplierIds.includes(p.supplierId)) as any;
    },
    async spendInPeriod({ businessId, sinceMs }) {
      const within = pos.filter((p) => p.businessId === businessId && p.createdAt >= sinceMs && p.status !== 'cancelled');
      return { totalCents: within.reduce((a, p) => a + p.totalCents, 0), orderCount: within.length };
    },
    async spendForProduct({ businessId, sinceMs, productName }) {
      const items = await listRecentPoItems({ businessId, sinceMs });
      const p = productByName(productName);
      if (!p) return 0;
      return items.filter((i) => i.productId === p.id).reduce((a, i) => a + i.quantity * i.unitPriceCents, 0);
    },
    async spendForSupplier({ businessId, sinceMs, supplierName: sName }) {
      const items = await listRecentPoItems({ businessId, sinceMs });
      return items.filter((i) => supplierName(i.supplierId).toLowerCase().includes(sName.toLowerCase())).reduce((a, i) => a + i.unitPriceCents * i.quantity, 0);
    },
    async savingsOpportunities({ businessId, sinceMs }) {
      const items = await listRecentPoItems({ businessId, sinceMs });
      const seen = new Set<string>();
      const out: any[] = [];
      for (const it of items) {
        if (seen.has(it.productId)) continue;
        seen.add(it.productId);
        const offersForProd = offersFor(it.productId).filter((o) => o.availabilityStatus !== 'out_of_stock');
        if (!offersForProd.length) continue;
        const cheapest = offersForProd.reduce((m, o) => (o.priceCents < m.priceCents ? o : m), offersForProd[0]);
        if (cheapest.priceCents >= it.unitPriceCents) continue;
        const product = products.find((p) => p.id === it.productId);
        out.push({
          productName: product?.name ?? '—',
          currentSupplierName: supplierName(it.supplierId),
          currentPriceCents: it.unitPriceCents,
          alternativeSupplierName: cheapest.supplier.name,
          alternativePriceCents: cheapest.priceCents,
          savingCents: it.unitPriceCents - cheapest.priceCents,
        });
      }
      return out;
    },
    async recentPoItemsForRecurrence(opts) {
      return listRecentPoItems(opts);
    },
    async recentPoItemsForReorder(opts) {
      return listRecentPoItems(opts);
    },
    async priceChangeMovers({ businessId, sinceMs }) {
      const items = await listRecentPoItems({ businessId, sinceMs });
      const byProd = new Map<string, Array<{ price: number; ts: number; name: string }>>();
      for (const it of items) {
        const arr = byProd.get(it.productId) ?? [];
        const p = products.find((pp) => pp.id === it.productId);
        arr.push({ price: it.unitPriceCents, ts: it.createdAt, name: p?.name ?? '—' });
        byProd.set(it.productId, arr);
      }
      const movers: Array<{ productName: string; from: number; to: number; pct: number }> = [];
      for (const [, arr] of byProd) {
        arr.sort((a, b) => a.ts - b.ts);
        if (arr.length < 2) continue;
        const from = arr[0].price;
        const to = arr[arr.length - 1].price;
        if (from === 0) continue;
        const pct = Math.round(((to - from) / from) * 100);
        movers.push({ productName: arr[arr.length - 1].name, from, to, pct });
      }
      movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
      return movers;
    },
    async listProductNames() {
      return products.map((p) => p.name);
    },
    async listSupplierNames() {
      return Array.from(new Set(offers.map((o) => o.supplier.name)));
    },
    async productNamesByIds(ids: string[]) {
      const out = new Map<string, string>();
      for (const p of products) {
        if (ids.includes(p.id)) out.set(p.id, p.name);
      }
      return out;
    },
    async topProductsLast30d({ limit }: { businessId: string; limit: number }) {
      const counts = new Map<string, number>();
      for (const it of poItems) {
        if (!it.productName) continue;
        counts.set(it.productName, (counts.get(it.productName) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, count]) => ({ name, count }));
    },
    async topIntentsLast30d({ limit }: { businessId: string; limit: number }) {
      return [
        { intent: 'find_cheapest', count: 3 },
        { intent: 'savings', count: 2 },
        { intent: 'spend_summary', count: 1 },
      ].slice(0, limit);
    },
    async createDraftFromRecommendation({ businessId, items, idempotencyKey }: { businessId: string; userId: string; items: Array<{ product: string; quantity: number; unit: string; priceCents: number; supplier: string }>; idempotencyKey: string }) {
      // Validate items reference known catalog rows (same as production).
      for (const it of items) {
        const product = products.find((p) => p.name.toLowerCase() === it.product.toLowerCase());
        const supplier = offers.find((o) => o.supplier.name.toLowerCase() === it.supplier.toLowerCase());
        if (!product) throw new Error(`Unknown product: ${it.product}`);
        if (!supplier) throw new Error(`Unknown supplier: ${it.supplier}`);
      }
      return { poRef: `PO-MOCK-${idempotencyKey.slice(-4)}`, estimatedDelivery: '2026-09-09' };
    },
    async poItemCadence({ productId }: { businessId: string; productId: string; sinceMs: number }) {
      const tsFor = (productId: string): number[] => {
        if (productId === 'p_cadence') return [0, 7, 14, 21, 28].map((d) => d * 86400000);
        if (productId === 'p_sparse') return [0, 90 * 86400000];
        return [];
      };
      const ts = tsFor(productId);
      if (ts.length < 3) return null;
      const gaps = ts.slice(1).map((v, i) => (v - ts[i]!) / 86400000);
      const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
      return {
        avgIntervalDays: mean,
        stddevDays: 0,
        count: gaps.length,
        minIntervalDays: Math.min(...gaps),
        maxIntervalDays: Math.max(...gaps),
      };
    },
  };
}

export function aiEnvFixture() {
  return {
    ENVIRONMENT: 'test',
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    AI: undefined,
    VYRO_AI_ENABLED: 'true',
    VYRO_AI_CLASSIFY_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    VYRO_AI_NARRATE_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    VYRO_AI_DAILY_TOKEN_CAP: '200000',
  } as any;
}
