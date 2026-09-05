import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { platformSettings } from '@vyro/db/schema';

/**
 * Compute platform fee in cents for a given gross amount.
 * Defaults to 250 bps (2.50%) if platform_settings row missing.
 */
export function computePlatformFeeCents(amountCents: number, feeBps: number): number {
  if (amountCents <= 0) return 0;
  return Math.round((amountCents * feeBps) / 10_000);
}

export async function getPlatformFeeBps(d1: D1Database): Promise<number> {
  const db = getDb(d1);
  const row = await db.select({ bps: platformSettings.platformFeeBps }).from(platformSettings).where(eq(platformSettings.id, 1)).get();
  return row?.bps ?? 250;
}
