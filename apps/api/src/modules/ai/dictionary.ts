import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { products, suppliers } from '@vyro/db/schema';
import type { AiDictionary } from '@vyro/ai';
import type { Env } from '../../env';

const KV_KEY = 'ai:dict:v1';
const TTL_SECONDS = 60 * 60;

/**
 * loadDictionary: returns product + supplier name lists for slot extraction.
 * Cached in KV for 1h. Catalog-level (not tenant-scoped) — these names are
 * public to authenticated business users. Tenancy is enforced at the handler
 * layer via `businessId`.
 */
export async function loadDictionary(env: Env): Promise<AiDictionary> {
  const cache = (env as any).CACHE;
  if (cache) {
    const cached = await cache.get(KV_KEY, 'json');
    if (cached) return cached as AiDictionary;
  }
  const db = getDb(env.DB);
  const [prods, sups] = await Promise.all([
    db
      .select({ name: products.name })
      .from(products)
      .where(and(isNull(products.deletedAt), eq(products.active, true)))
      .limit(2000)
      .all(),
    db
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(isNull(suppliers.deletedAt))
      .limit(2000)
      .all(),
  ]);
  const dict: AiDictionary = {
    products: prods.map((p) => p.name),
    suppliers: sups.map((s) => s.name),
  };
  if (cache) await cache.put(KV_KEY, JSON.stringify(dict), { expirationTtl: TTL_SECONDS });
  return dict;
}
