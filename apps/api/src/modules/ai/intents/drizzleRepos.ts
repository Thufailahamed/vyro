import { and, asc, desc, eq, gte, isNull, like, ne, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  products,
  supplierProducts,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  auditLogs,
} from '@vyro/db/schema';
import { newId } from '@vyro/shared';
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

    async poItemCadence({ businessId, productId, sinceMs }) {
      const rows = await db
        .select({ createdAt: purchaseOrders.createdAt })
        .from(purchaseOrderItems)
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
        .innerJoin(supplierProducts, eq(supplierProducts.id, purchaseOrderItems.supplierProductId))
        .where(and(
          eq(purchaseOrders.businessId, businessId),
          eq(supplierProducts.productId, productId),
          ne(purchaseOrders.status, 'cancelled'),
          gte(purchaseOrders.createdAt, sinceMs),
        ))
        .all();
      if (rows.length < 3) return null;
      const uniqueTs = [...new Set(rows.map((r) => r.createdAt))].sort((a, b) => a - b);
      if (uniqueTs.length < 3) return null;
      const gaps: number[] = [];
      for (let i = 1; i < uniqueTs.length; i++) {
        gaps.push((uniqueTs[i]! - uniqueTs[i - 1]!) / 86400000);
      }
      const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
      const variance = gaps.reduce((s, v) => s + (v - mean) ** 2, 0) / gaps.length;
      const stddev = Math.sqrt(variance);
      return {
        avgIntervalDays: Math.round(mean * 10) / 10,
        stddevDays: Math.round(stddev * 10) / 10,
        count: gaps.length,
        minIntervalDays: Math.round(Math.min(...gaps) * 10) / 10,
        maxIntervalDays: Math.round(Math.max(...gaps) * 10) / 10,
      };
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

    async productNamesByIds(ids) {
      const unique = [...new Set(ids)].slice(0, 200);
      const out = new Map<string, string>();
      if (!unique.length) return out;
      // Chunked to stay well within D1 variable limits.
      for (let i = 0; i < unique.length; i += 50) {
        const chunk = unique.slice(i, i + 50);
        const placeholders = sql.join(chunk.map((id) => sql`${id}`), sql.raw(','));
        const rows = await db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(sql`${products.id} in (${placeholders})`)
          .all();
        for (const r of rows) out.set(r.id, r.name);
      }
      return out;
    },

    async topProductsLast30d({ businessId, limit }) {
      const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const rows = await db
        .select({
          name: purchaseOrderItems.productNameSnapshot,
          count: sql<number>`count(*)`,
        })
        .from(purchaseOrderItems)
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
        .where(and(eq(purchaseOrders.businessId, businessId), ne(purchaseOrders.status, 'cancelled'), gte(purchaseOrders.createdAt, sinceMs)))
        .groupBy(purchaseOrderItems.productNameSnapshot)
        .orderBy(sql`count(*) desc`)
        .limit(limit)
        .all();
      return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
    },

    async topIntentsLast30d({ businessId, limit }) {
      // audit_logs is keyed on action='ai.request' + json_extract(metadata,'$.businessId')
      const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const rows = await db
        .select({
          intent: sql<string>`json_extract(metadata, '$.intent')`,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(and(eq(auditLogs.action, 'ai.request'), gte(auditLogs.createdAt, sinceMs), sql`json_extract(${auditLogs.metadata}, '$.businessId') = ${businessId}`))
        .groupBy(sql`json_extract(metadata, '$.intent')`)
        .orderBy(sql`count(*) desc`)
        .limit(limit)
        .all();
      return rows
        .filter((r) => r.intent)
        .map((r) => ({ intent: String(r.intent), count: Number(r.count) }));
    },

    async topCheapestOffers({ limit }) {
      // Take all live offers, rank by price asc, then pick the cheapest
      // offer per product in app code (sqlite window-function limits in D1
      // make DISTINCT ON unreliable). Cheap because index hits + small N.
      const rows = await db
        .select({
          productId: supplierProducts.productId,
          productName: products.name,
          supplierId: suppliers.id,
          supplierName: suppliers.name,
          priceCents: supplierProducts.priceCents,
          leadTimeDays: supplierProducts.leadTimeDays,
          deliveryAvailable: supplierProducts.deliveryAvailable,
          minOrderQty: supplierProducts.minOrderQty,
          availabilityStatus: supplierProducts.availabilityStatus,
        })
        .from(supplierProducts)
        .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
        .innerJoin(products, eq(products.id, supplierProducts.productId))
        .where(and(
          offerNotDeleted,
          offerActive,
          ne(supplierProducts.availabilityStatus, 'out_of_stock'),
          isNull(suppliers.deletedAt),
          isNull(products.deletedAt),
        ))
        .orderBy(asc(supplierProducts.priceCents), desc(sql`${supplierProducts.leadTimeDays}`))
        .all();

      const cheapestByProduct = new Map<string, typeof rows[number]>();
      for (const r of rows) {
        if (!cheapestByProduct.has(r.productId)) cheapestByProduct.set(r.productId, r);
        if (cheapestByProduct.size >= limit * 4) break; // safety cap
      }

      // Count offers per product for the offerCount badge.
      const offerCounts = new Map<string, number>();
      for (const r of rows) offerCounts.set(r.productId, (offerCounts.get(r.productId) ?? 0) + 1);

      const out = [...cheapestByProduct.values()]
        .map((r) => ({
          productId: r.productId,
          productName: r.productName,
          supplierId: r.supplierId,
          supplierName: r.supplierName,
          priceCents: r.priceCents,
          leadTimeDays: r.leadTimeDays,
          deliveryAvailable: !!r.deliveryAvailable,
          minOrderQty: r.minOrderQty,
          availabilityStatus: r.availabilityStatus as 'in_stock' | 'low' | 'out_of_stock',
          offerCount: offerCounts.get(r.productId) ?? 0,
        }))
        .slice(0, limit);
      return out;
    },

    async createDraftFromRecommendation({ businessId, userId, items, idempotencyKey }) {
      if (!items.length) throw new Error('items required');
      // Resolve supplier ids + product ids from snapshot names. Caller has
      // already passed RBAC; we further reject items referencing unknown
      // catalog entities to avoid inserting arbitrary product names.
      const supplierRows = await db
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(isNull(suppliers.deletedAt))
        .all();
      const productRows = await db
        .select({ id: products.id, name: products.name, unit: products.unit })
        .from(products)
        .where(and(isNull(products.deletedAt), eq(products.active, true)))
        .all();
      const supplierByName = new Map(supplierRows.map((s) => [s.name.toLowerCase(), s.id]));
      const productByName = new Map(productRows.map((p) => [p.name.toLowerCase(), { id: p.id, unit: p.unit }]));

      // Idempotency cache (KV). Replays return the same poRef.
      const cacheKey = `ai:confirm:${businessId}:${idempotencyKey}`;
      const cached = await env.CACHE?.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          return { poRef: parsed.poRef, estimatedDelivery: parsed.estimatedDelivery };
        } catch {
          // fall through to create
        }
      }

      // Validate every item against real catalog rows.
      const resolvedItems = items.map((it) => {
        const product = productByName.get(it.product.toLowerCase());
        const supplierId = supplierByName.get(it.supplier.toLowerCase());
        if (!product) throw new Error(`Unknown product: ${it.product}`);
        if (!supplierId) throw new Error(`Unknown supplier: ${it.supplier}`);
        if (!Number.isFinite(it.priceCents) || it.priceCents < 0) throw new Error(`Invalid price for ${it.product}`);
        if (!Number.isFinite(it.quantity) || it.quantity < 1) throw new Error(`Invalid quantity for ${it.product}`);
        return { ...it, productId: product.id, supplierId };
      });

      const poId = newId();
      const poRef = `PO-${Date.now().toString(36).toUpperCase()}-${poId.slice(-4).toUpperCase()}`;
      const now = Date.now();
      const totalCents = resolvedItems.reduce((s, it) => s + it.priceCents * it.quantity, 0);
      const estimatedDelivery = new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      await db.insert(purchaseOrders).values({
        id: poId,
        businessId,
        supplierId: resolvedItems[0]!.supplierId,
        status: 'draft',
        totalCents,
        createdAt: now,
        createdBy: userId,
      } as any);

      for (const it of resolvedItems) {
        await db.insert(purchaseOrderItems).values({
          id: newId(),
          purchaseOrderId: poId,
          supplierProductId: it.productId,
          productNameSnapshot: it.product,
          unitPriceCents: it.priceCents,
          unitPriceCentsSnapshot: it.priceCents,
          discountPctSnapshot: 0,
          quantity: it.quantity,
          lineTotalCents: it.priceCents * it.quantity,
        } as any);
      }

      const payload = { poRef, estimatedDelivery };
      try {
        await env.CACHE?.put(cacheKey, JSON.stringify(payload), { expirationTtl: 86400 });
      } catch {
        // ignore cache failures
      }
      return payload;
    },
  };
}
