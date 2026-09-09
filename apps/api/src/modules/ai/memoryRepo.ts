import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { aiPreferences } from '@vyro/db/schema';
import type { PreferenceRepo, PreferenceRow } from './memory';

export function drizzlePreferenceRepo(d1: D1Database): PreferenceRepo {
  const db = getDb(d1);
  return {
    async list({ businessId, kind }) {
      const where = kind
        ? and(eq(aiPreferences.businessId, businessId), eq(aiPreferences.kind, kind as 'preferred_supplier' | 'frequently_ordered' | 'procurement_default'))
        : eq(aiPreferences.businessId, businessId);
      const rows = await db.select().from(aiPreferences).where(where).all();
      return rows.map(toRow);
    },
    async upsert(row) {
      const values = {
        id: row.id,
        userId: row.userId,
        businessId: row.businessId,
        kind: row.kind,
        key: row.key,
        valueJson: row.valueJson,
        source: row.source,
        confidence: row.confidence,
        occurrences: row.occurrences,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      await db
        .insert(aiPreferences)
        .values(values)
        .onConflictDoUpdate({
          target: [aiPreferences.businessId, aiPreferences.kind, aiPreferences.key],
          set: {
            valueJson: values.valueJson,
            source: values.source,
            confidence: values.confidence,
            occurrences: values.occurrences,
            updatedAt: values.updatedAt,
          },
        });
      return values;
    },
    async delete(id, businessId?: string) {
      if (businessId) {
        await db.delete(aiPreferences).where(and(eq(aiPreferences.id, id), eq(aiPreferences.businessId, businessId)));
      } else {
        await db.delete(aiPreferences).where(eq(aiPreferences.id, id));
      }
    },
  };
}

function toRow(r: typeof aiPreferences.$inferSelect): PreferenceRow {
  return {
    id: r.id,
    userId: r.userId,
    businessId: r.businessId,
    kind: r.kind,
    key: r.key,
    valueJson: r.valueJson,
    source: r.source,
    confidence: r.confidence,
    occurrences: r.occurrences,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
