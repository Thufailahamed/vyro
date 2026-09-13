import iso from '../data/iso-country-codes.json';
import { countries } from './countries';
import type { Db } from '../getDb';

export async function seedCountries(db: Db): Promise<number> {
  let count = 0;
  for (const c of iso) {
    await db
      .insert(countries)
      .values({
        code: c.code,
        name: c.name,
        isSanctioned: c.isSanctioned,
        fxJurisdiction: c.fxJurisdiction,
      })
      .onConflictDoNothing();
    count++;
  }
  return count;
}