import { fxSnapshots } from '@vyro/db/schema';
import { fetchRate } from '../../lib/fxProvider';
import { httpError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { Db } from '@vyro/db';

const KV_TTL = 3600;
const KV_KEY_PREFIX = 'fx:';

export async function getLiveRate(base: string, quote: string, env: Env): Promise<string | null> {
  const cacheKey = `${KV_KEY_PREFIX}${base}:${quote}`;
  const cached = await env.CROSS_BORDER_KV.get(cacheKey);
  if (cached) return cached;
  const fetched = await fetchRate(base, quote, env);
  if (!fetched) return null;
  await env.CROSS_BORDER_KV.put(cacheKey, fetched.rateScaled, { expirationTtl: KV_TTL });
  return fetched.rateScaled;
}

export async function snapshotRate(
  base: string,
  quote: string,
  db: Db,
  env: Env,
): Promise<{ id: string; rateScaled: string }> {
  const fetched = await fetchRate(base, quote, env);
  if (!fetched) {
    logger.warn('fx.fetch.failed', { base, quote });
    throw httpError(503, 'FX_UNAVAILABLE', 'Cannot fetch FX rate');
  }
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(fxSnapshots)
    .values({
      id,
      base,
      quoteCurrency: quote,
      rateScaled: fetched.rateScaled,
      fetchedAt: Date.now(),
      provider: fetched.provider,
    })
    .returning();
  return { id: row.id, rateScaled: row.rateScaled };
}

export async function convertCents(
  amountCents: number,
  fromCurrency: string,
  toCurrency: string,
  rateScaled: string,
): Promise<number> {
  if (fromCurrency === toCurrency) return amountCents;
  const rate = Number(rateScaled) / 1e8;
  return Math.round(amountCents * rate);
}