import { getDb } from '@vyro/db';
import { configSections } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';

export type ConfigSectionRow = {
  section: string;
  valueJson: string;
  version: number;
  updatedBy: string | null;
  updatedAt: number;
};

export async function getSection(
  d1: D1Database,
  section: string,
): Promise<ConfigSectionRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(configSections)
    .where(eq(configSections.section, section))
    .get()) as ConfigSectionRow | undefined;
  return row ?? null;
}

export async function upsertSection(
  d1: D1Database,
  section: string,
  valueJson: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<{ section: string; version: number; valueJson: string } | { conflict: true }> {
  const existing = await getSection(d1, section);
  if (!existing) {
    await getDb(d1)
      .insert(configSections)
      .values({ section, valueJson, version: 0, updatedBy, updatedAt: Date.now() })
      .run();
    return { section, version: 0, valueJson };
  }
  if (existing.version !== expectedVersion) return { conflict: true };
  const newVersion = existing.version + 1;
  await getDb(d1)
    .update(configSections)
    .set({ valueJson, version: newVersion, updatedBy, updatedAt: Date.now() })
    .where(eq(configSections.section, section))
    .run();
  return { section, version: newVersion, valueJson };
}
