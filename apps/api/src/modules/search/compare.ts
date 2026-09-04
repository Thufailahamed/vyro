import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { products, supplierProducts, suppliers } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';

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

  const offers = await db
    .select({
      offer: supplierProducts,
      supplier: suppliers,
    })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
    .where(and(eq(supplierProducts.productId, productId), isNull(supplierProducts.deletedAt)))
    .all();

  const ranked = offers
    .filter((r) => r.offer.active)
    .sort((a, b) => a.offer.priceCents - b.offer.priceCents)
    .map((r, i) => ({ rank: i + 1, ...r }));

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

  return c.json({ product, offers: ranked, priceStats });
});

export default router;
