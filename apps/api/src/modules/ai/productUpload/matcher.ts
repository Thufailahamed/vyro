import { getDb } from '@vyro/db';
import { products, supplierProducts } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { tokenJaccard } from '../intents/tokenJaccard';
import type { CandidateRow } from './extract';

/**
 * Catalog matching for staged AI rows: supplierSku hits are exact; product
 * names are matched to the live catalog with token Jaccard (already in the
 * copilot toolbox). Below the threshold the row becomes a catalog proposal,
 * which the commit path turns into an inactive product for admin moderation.
 */

export const MATCH_THRESHOLD = 0.75;

export type MatchResult = {
  matchType: 'offer' | 'product' | 'proposal' | 'none';
  productId?: string | undefined;
  matchScore: number;
};

type Db = ReturnType<typeof getDb>;

export async function matchRows(db: Db, supplierId: string, rows: CandidateRow[]): Promise<MatchResult[]> {
  const offers = await db
    .select({ productId: supplierProducts.productId, supplierSku: supplierProducts.supplierSku })
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierId, supplierId))
    .all();
  const skuByLower = new Map(
    offers.filter((o) => o.supplierSku).map((o) => [o.supplierSku!.toLowerCase(), o.productId]),
  );
  const offerProductIds = new Set(offers.map((o) => o.productId));

  // The live catalog is small (thousands) — load it once and score in JS.
  const catalog = (await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.active, true)).all())
    .map((p) => ({ id: p.id, nameLower: p.name.toLowerCase() }));

  return rows.map((r) => {
    const sku = r.supplierSku?.toLowerCase();
    if (sku && skuByLower.has(sku)) {
      return { matchType: 'offer' as const, productId: skuByLower.get(sku)!, matchScore: 100 };
    }
    let best: { id: string; score: number } | null = null;
    const nameLower = r.productName.toLowerCase();
    for (const c of catalog) {
      const score = Math.round(tokenJaccard(nameLower, c.nameLower) * 100);
      if (!best || score > best.score) best = { id: c.id, score };
    }
    if (best && best.score >= MATCH_THRESHOLD * 100) {
      return {
        matchType: offerProductIds.has(best.id) ? ('offer' as const) : ('product' as const),
        productId: best.id,
        matchScore: best.score,
      };
    }
    return { matchType: r.productName ? ('proposal' as const) : ('none' as const), productId: undefined, matchScore: best?.score ?? 0 };
  });
}
