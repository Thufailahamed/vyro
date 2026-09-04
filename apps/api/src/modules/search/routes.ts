import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, gt, like, isNull, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { products, supplierProducts, suppliers } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

const querySchema = z
  .object({
    q: z.string().min(1).max(120),
    categoryId: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

type ProductRow = typeof products.$inferSelect;
type OfferRow = typeof supplierProducts.$inferSelect;
type SupplierRow = typeof suppliers.$inferSelect;

interface SearchHit {
  product: ProductRow;
  bestOffer: (OfferRow & { supplier: SupplierRow }) | null;
  offerCount: number;
}

router.get('/products', async (c) => {
  const parsed = querySchema.safeParse({
    q: c.req.query('q'),
    categoryId: c.req.query('categoryId') ?? undefined,
    cursor: c.req.query('cursor') ?? undefined,
    limit: c.req.query('limit') ?? undefined,
  });
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query', parsed.error.flatten());

  const db = getDb(c.env.DB);
  const pattern = `%${parsed.data.q.toLowerCase()}%`;

  const conds: any[] = [isNull(products.deletedAt), sql`lower(${products.name}) like ${pattern}`];
  if (parsed.data.categoryId) conds.push(eq(products.categoryId, parsed.data.categoryId));
  if (parsed.data.cursor) conds.push(gt(products.id, parsed.data.cursor));

  const rows: ProductRow[] = await db
    .select()
    .from(products)
    .where(and(...conds))
    .limit(parsed.data.limit + 1)
    .all();

  const hasMore = rows.length > parsed.data.limit;
  const page = rows.slice(0, parsed.data.limit);
  const lastRow = page[page.length - 1];
  const nextCursor = hasMore && lastRow ? lastRow.id : null;

  const productIds = page.map((p) => p.id);
  let offerMap = new Map<string, { offers: OfferRow[]; suppliers: Map<string, SupplierRow> }>();
  if (productIds.length) {
    const offers = await db
      .select()
      .from(supplierProducts)
      .where(and(sql`${supplierProducts.productId} in (${sql.join(productIds.map((id) => sql`${id}`), sql.raw(','))})`, isNull(supplierProducts.deletedAt)))
      .all();
    const supplierIds = [...new Set(offers.map((o) => o.supplierId))];
    const supplierRows = supplierIds.length
      ? await db
          .select()
          .from(suppliers)
          .where(sql`${suppliers.id} in (${sql.join(supplierIds.map((id) => sql`${id}`), sql.raw(','))})`)
          .all()
      : [];
    const smap = new Map(supplierRows.map((s) => [s.id, s]));
    for (const id of productIds) offerMap.set(id, { offers: [], suppliers: smap });
    for (const o of offers) offerMap.get(o.productId)?.offers.push(o);
  }

  const hits: SearchHit[] = page.map((p) => {
    const entry = offerMap.get(p.id);
    const live = entry?.offers.filter((o) => o.active) ?? [];
    const best = live.slice().sort((a, b) => a.priceCents - b.priceCents)[0] ?? null;
    const supplier = best ? entry?.suppliers.get(best.supplierId) ?? null : null;
    return {
      product: p,
      bestOffer: best && supplier ? { ...best, supplier } : null,
      offerCount: live.length,
    };
  });

  return c.json({ hits, nextCursor });
});

export default router;
