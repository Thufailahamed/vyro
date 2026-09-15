import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { products, supplierProducts, suppliers, productImages } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { computeRanking } from '../searchRanking/score';

const router = new Hono<{ Bindings: Env }>();

router.get('/products/:id/offers', async (c) => {
  const productId = c.req.param('id');
  const db = getDb(c.env.DB);
  const product = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)))
    .get();
  if (!product) throw httpError(404, 'NOT_FOUND', 'Product not found');

  const rawImages = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(productImages.sortOrder)
    .all();

  const images = rawImages.map((img) => ({
    id: img.id,
    url: img.r2Key.startsWith('http://') || img.r2Key.startsWith('https://')
      ? img.r2Key
      : `/api/products/images/${img.r2Key}`,
    altText: img.altText,
  }));

  const offers = await db
    .select({
      offer: supplierProducts,
      supplier: suppliers,
    })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
    .where(and(eq(supplierProducts.productId, productId), isNull(supplierProducts.deletedAt)))
    .all();

  const activeOffers = offers.filter((r) => r.offer.active);
  const { trustSealRepository } = await import('../trustSeal/repository');
  const trustMap = await trustSealRepository.batchStatus(
    c.env.DB,
    [...new Set(activeOffers.map((r) => r.supplier.id))],
  );
  const ranking = computeRanking(
    activeOffers.map((r) => ({
      priceCents: r.offer.priceCents,
      leadTimeDays: r.offer.leadTimeDays,
      supplier: {
        verificationStatus: r.supplier.verificationStatus,
        reviewCount: r.supplier.reviewCount ?? 0,
        reviewAvgX100: r.supplier.reviewAvg ?? 0,
        lastReviewAt: r.supplier.lastReviewAt ?? null,
        trustSealed: trustMap.get(r.supplier.id)?.trustSealed ?? false,
      },
    })),
  );
  const ranked = activeOffers
    .map((r, i) => ({
      ...r,
      supplier: {
        ...r.supplier,
        trustSealed: trustMap.get(r.supplier.id)?.trustSealed ?? false,
        trustSealExpiresAt: trustMap.get(r.supplier.id)?.trustSealExpiresAt ?? null,
        memberSinceYear: trustMap.get(r.supplier.id)?.memberSinceYear ?? null,
      },
      ranking: ranking[i] ?? { index: i, score: 0, rank: i + 1, reasons: [] },
    }))
    .sort((a, b) => (a.ranking?.rank ?? 0) - (b.ranking?.rank ?? 0));

  const priceStats = offers.length
    ? {
        count: offers.length,
        min: Math.min(...offers.map((r) => r.offer.priceCents)),
        max: Math.max(...offers.map((r) => r.offer.priceCents)),
        median: (() => {
          const sorted = offers.map((r) => r.offer.priceCents).sort((a, b) => a - b);
          const m = Math.floor(sorted.length / 2);
          if (sorted.length % 2) return sorted[m] ?? null;
          const a = sorted[m - 1];
          const b = sorted[m];
          return a != null && b != null ? Math.round((a + b) / 2) : null;
        })(),
      }
    : { count: 0, min: null, max: null, median: null };

  return c.json({
    product: {
      ...product,
      imageUrl: images[0]?.url ?? null,
      images,
    },
    offers: ranked,
    priceStats,
  });
});

export default router;
