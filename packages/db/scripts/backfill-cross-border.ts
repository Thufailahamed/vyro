#!/usr/bin/env tsx
import { getDb } from '../src/getDb';
import { seedCountries } from '../src/schema/countries.seed';
import { suppliers } from '../src/schema/suppliers';
import { businesses } from '../src/schema/businesses';
import { isNull, sql } from 'drizzle-orm';

// Backfill is idempotent. Run via: pnpm --filter @vyro/db backfill:cross-border
// Reads D1 binding from CLOUDFLARE_D1_DATABASE_ID or expects wrangler dev to provide it.
// For local, run with: pnpm exec wrangler d1 execute vyro --local --file=./seed-cross-border.sql

async function main() {
  const d1 = process.env.D1 as unknown as D1Database;
  if (!d1) {
    console.error('D1 binding not provided. Run via wrangler dev or use seed SQL file.');
    process.exit(1);
  }
  const db = getDb(d1);
  const seeded = await seedCountries(db);
  const supRes = await db
    .update(suppliers)
    .set({ countryCode: 'LK' })
    .where(isNull(suppliers.countryCode));
  const busRes = await db
    .update(businesses)
    .set({ countryCode: 'LK' })
    .where(isNull(businesses.countryCode));
  console.log(`Seeded ${seeded} countries, updated ${(supRes as unknown as { rowsAffected: number }).rowsAffected ?? 0} suppliers, ${(busRes as unknown as { rowsAffected: number }).rowsAffected ?? 0} businesses`);
  // purchase_orders.direction defaults 'domestic' — no backfill needed
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});