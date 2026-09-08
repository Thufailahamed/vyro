import { and, eq, gte, isNull, like, ne, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  products,
  supplierProducts,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
} from '@vyro/db/schema';
import type { Env } from '../../../env';
import type {
  AiRepos,
  OfferRow,
  PoItemRow,
  PoRow,
  ProductRow,
  SupplierRow,
} from './repos';

const offerActive = eq(supplierProducts.active, true);
const offerNotDeleted = isNull(supplierProducts.deletedAt);

export function drizzleRepos(env: Env): AiRepos {
  const db = getDb(env.DB);

  return {
    async searchProducts(q, limit = 20) {
      const rows = await db
        .select()
        .from(products)
        .where(and(isNull(products.deletedAt), like(sql`lower(${products.name})`, `%${q.toLowerCase()}%`)))
        .limit(limit)
        .all();
      const productIds = rows.map((r) => r.id);
      const offerMap = new Map<string, Array<OfferRow & { supplier: SupplierRow }>>();
      if (productIds.length) {
        const placeholders = sql.join(productIds.map((id) => sql`${id}`), sql.raw(','));
        const offers = await db
          .select({ offer: supplierProducts, supplier: suppliers })
          .from(supplierProducts)
          .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
          .where(and(sql`${supplierProducts.productId} in (${placeholders})`, offerNotDeleted, offerActive))
          .all();
        for (const o of offers) {
          const flat: OfferRow & { supplier: SupplierRow } = {
            id: o.offer.id,
            supplierId: o.supplier.id,
            productId: o.offer.productId,
            priceCents: o.offer.priceCents,
            minOrderQty: o.offer.minOrderQty,
            leadTimeDays: o.offer.leadTimeDays,
            deliveryAvailable: o.offer.deliveryAvailable,
            availabilityStatus: o.offer.availabilityStatus,
            active: o.offer.active,
            supplier: { id: o.supplier.id, name: o.supplier.name },
          };
          const arr = offerMap.get(o.offer.productId) ?? [];
          arr.push(flat);
          offerMap.set(o.offer.productId, arr);
        }
      }
      return rows.map((p) => {
        const live = (offerMap.get(p.id) ?? []).filter((o) => o.availabilityStatus !== 'out_of_stock');
        const best = live.slice().sort((a, b) => a.priceCents - b.priceCents)[0] ?? null;
        return {
          ...(p as ProductRow),
          bestOffer: best,
          offerCount: live.length,
        };
      });
    },

    async findProductByName(name) {
      const row = await db
        .select()
        .from(products)
        .where(and(isNull(products.deletedAt), like(sql`lower(${products.name})`, `%${name.toLowerCase()}%`)))
        .limit(1)
        .get();
      return (row as ProductRow | undefined) ?? null;
    },

    async listOffersByProduct(productId) {
      const rows = await db
        .select({ offer: supplierProducts, supplier: suppliers })
        .from(supplierProducts)
        .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
        .where(and(eq(supplierProducts.productId, productId), offerNotDeleted, offerActive))
        .all();
      return rows.map((o) => ({
        id: o.offer.id,
        supplierId: o.supplier.id,
        productId: o.offer.productId,
        priceCents: o.offer.priceCents,
        minOrderQty: o.offer.minOrderQty,
        leadTimeDays: o.offer.leadTimeDays,
        deliveryAvailable: o.offer.deliveryAvailable,
        availabilityStatus: o.offer.availabilityStatus,
        active: o.offer.active,
        supplier: { id: o.supplier.id, name: o.supplier.name },
      })) as Array<OfferRow & { supplier: SupplierRow }>;
    },

    async listSupplierProducts(opts) {
      const conds: any[] = [offerNotDeleted];
      if (opts.active !== false) conds.push(offerActive);
      const rows = await db
        .select({
          supplierName: suppliers.name,
          supplierId: suppliers.id,
          leadTimeDays: supplierProducts.leadTimeDays,
          deliveryAvailable: supplierProducts.deliveryAvailable,
          deliveryRadiusKm: supplierProducts.deliveryRadiusKm,
          priceCents: supplierProducts.priceCents,
          availabilityStatus: supplierProducts.availabilityStatus,
          productId: supplierProducts.productId,
        })
        .from(supplierProducts)
        .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
        .where(and(...conds))
        .all();
      let filtered = rows;
      if (opts.productName) {
        const p = await db
          .select({ id: products.id })
          .from(products)
          .where(and(isNull(products.deletedAt), like(sql`lower(${products.name})`, `%${opts.productName.toLowerCase()}%`)))
          .limit(1)
          .get();
        if (!p) return [];
        filtered = filtered.filter((r) => r.productId === p.id);
      }
      if (opts.supplierName) {
        filtered = filtered.filter((r) => r.supplierName.toLowerCase().includes(opts.supplierName!.toLowerCase()));
      }
      return filtered as any;
    },

    async listRecentPoItems({ businessId, sinceMs }) {
      const rows = await db
        .select({
          id: purchaseOrderItems.id,
          purchaseOrderId: purchaseOrderItems.purchaseOrderId,
          productId: supplierProducts.productId,
          supplierId: purchaseOrders.supplierId,
          quantity: purchaseOrderItems.quantity,
          unitPriceCents: purchaseOrderItems.unitPriceCents,
          createdAt: purchaseOrders.createdAt,
        })
        .from(purchaseOrderItems)
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
        .innerJoin(supplierProducts, eq(supplierProducts.id, purchaseOrderItems.supplierProductId))
        .where(and(eq(purchaseOrders.businessId, businessId), ne(purchaseOrders.status, 'cancelled'), gte(purchaseOrders.createdAt, sinceMs)))
        .all();
      return rows as unknown as PoItemRow[];
    },

    async listPosForSupplier({ businessId, supplierIds }) {
      if (!supplierIds.length) return [];
      const placeholders = sql.join(supplierIds.map((id) => sql`${id}`), sql.raw(','));
      const rows = await db
        .select()
        .from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.businessId, businessId),
          sql`${purchaseOrders.supplierId} in (${placeholders})`,
        ))
        .all();
      return rows as unknown as PoRow[];
    },

    async spendInPeriod({ businessId, sinceMs }) {
      const rows = await db
        .select({ totalCents: purchaseOrders.totalCents })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.businessId, businessId), ne(purchaseOrders.status, 'cancelled'), gte(purchaseOrders.createdAt, sinceMs)))
        .all();
      const totalCents = rows.reduce((acc, r) => acc + (r.totalCents ?? 0), 0);
      return { totalCents, orderCount: rows.length };
    },

    async spendForProduct({ businessId, sinceMs, productName }) {
      const row = await db
        .select({ total: sql<number>`sum(${purchaseOrderItems.quantity} * ${purchaseOrderItems.unitPriceCents})` })
        .from(purchaseOrderItems)
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
        .innerJoin(supplierProducts, eq(supplierProducts.id, purchaseOrderItems.supplierProductId))
        .innerJoin(products, eq(products.id, supplierProducts.productId))
        .where(and(eq(purchaseOrders.businessId, businessId), ne(purchaseOrders.status, 'cancelled'), gte(purchaseOrders.createdAt, sinceMs), like(sql`lower(${products.name})`, `%${productName.toLowerCase()}%`)))
        .get();
      return Number(row?.total ?? 0) || 0;
    },

    async spendForSupplier({ businessId, sinceMs, supplierName }) {
      const row = await db
        .select({ total: sql<number>`sum(${purchaseOrders.totalCents})` })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
        .where(and(eq(purchaseOrders.businessId, businessId), ne(purchaseOrders.status, 'cancelled'), gte(purchaseOrders.createdAt, sinceMs), like(sql`lower(${suppliers.name})`, `%${supplierName.toLowerCase()}%`)))
        .get();
      return Number(row?.total ?? 0) || 0;
    },

    async savingsOpportunities({ businessId, sinceMs }) {
      const recent = await this.listRecentPoItems({ businessId, sinceMs });
      const seen = new Set<string>();
      const out: Array<{
        productName: string;
        currentSupplierName: string;
        currentPriceCents: number;
        alternativeSupplierName: string;
        alternativePriceCents: number;
        savingCents: number;
      }> = [];

      const supplierNameById = new Map<string, string>();
      const allSuppliers = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).all();
      for (const s of allSuppliers) supplierNameById.set(s.id, s.name);

      for (const item of recent) {
        if (seen.has(item.productId)) continue;
        seen.add(item.productId);
        const offers = await this.listOffersByProduct(item.productId);
        const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
        if (!live.length) continue;
        const cheapest = live.reduce<typeof live[number] | undefined>((m, o) => {
          if (!m) return o;
          return o.priceCents < m.priceCents ? o : m;
        }, undefined);
        if (!cheapest || cheapest.priceCents >= item.unitPriceCents) continue;
        const productRow = await db
          .select({ name: products.name })
          .from(products)
          .where(eq(products.id, item.productId))
          .get();
        out.push({
          productName: productRow?.name ?? '—',
          currentSupplierName: supplierNameById.get(item.supplierId) ?? '—',
          currentPriceCents: item.unitPriceCents,
          alternativeSupplierName: cheapest.supplier.name,
          alternativePriceCents: cheapest.priceCents,
          savingCents: item.unitPriceCents - cheapest.priceCents,
        });
      }
      return out;
    },

    async recentPoItemsForRecurrence({ businessId, sinceMs }) {
      return this.listRecentPoItems({ businessId, sinceMs });
    },

    async recentPoItemsForReorder({ businessId, sinceMs }) {
      return this.listRecentPoItems({ businessId, sinceMs });
    },

    async priceChangeMovers({ businessId, sinceMs }) {
      const items = await this.listRecentPoItems({ businessId, sinceMs });
      const byProd = new Map<string, Array<{ price: number; ts: number; name: string }>>();
      const nameCache = new Map<string, string>();
      for (const it of items) {
        let name = nameCache.get(it.productId);
        if (!name) {
          const r = await db.select({ name: products.name }).from(products).where(eq(products.id, it.productId)).get();
          name = r?.name ?? '—';
          nameCache.set(it.productId, name);
        }
        const arr = byProd.get(it.productId) ?? [];
        arr.push({ price: it.unitPriceCents, ts: it.createdAt, name });
        byProd.set(it.productId, arr);
      }
      const movers: Array<{ productName: string; from: number; to: number; pct: number }> = [];
      for (const [, arr] of byProd) {
        arr.sort((a, b) => a.ts - b.ts);
        const first = arr[0];
        const last = arr[arr.length - 1];
        if (!first || !last || arr.length < 2 || first.price === 0) continue;
        const pct = Math.round(((last.price - first.price) / first.price) * 100);
        movers.push({ productName: last.name, from: first.price, to: last.price, pct });
      }
      movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
      return movers;
    },

    async listProductNames(limit = 2000) {
      const rows = await db
        .select({ name: products.name })
        .from(products)
        .where(and(isNull(products.deletedAt), eq(products.active, true)))
        .limit(limit)
        .all();
      return rows.map((r) => r.name);
    },

    async listSupplierNames(limit = 2000) {
      const rows = await db
        .select({ name: suppliers.name })
        .from(suppliers)
        .where(isNull(suppliers.deletedAt))
        .limit(limit)
        .all();
      return rows.map((r) => r.name);
    },
  };
}
