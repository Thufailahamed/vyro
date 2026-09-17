import { eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { supplierTrustSignals, suppliers, type TrustSignalsRow } from '@vyro/db/schema';

export interface TrustSignalInput {
  supplierId: string;
  kycVerified: number;
  memberSinceYear: number | null;
  totalCompletedPos: number;
  onTimeCount: number;
  onTimePctCached: number | null;
  disputedSupplierFaultCount: number;
  computedAt: number;
}

export const trustRepository = {
  async upsert(d1: D1Database, row: TrustSignalInput): Promise<void> {
    const db = getDb(d1);
    await db
      .insert(supplierTrustSignals)
      .values(row)
      .onConflictDoUpdate({
        target: supplierTrustSignals.supplierId,
        set: {
          kycVerified: row.kycVerified,
          memberSinceYear: row.memberSinceYear,
          totalCompletedPos: row.totalCompletedPos,
          onTimeCount: row.onTimeCount,
          onTimePctCached: row.onTimePctCached,
          disputedSupplierFaultCount: row.disputedSupplierFaultCount,
          computedAt: row.computedAt,
        },
      })
      .run();
  },

  async getBySupplierId(d1: D1Database, supplierId: string): Promise<TrustSignalsRow | null> {
    const db = getDb(d1);
    const row = await db
      .select()
      .from(supplierTrustSignals)
      .where(eq(supplierTrustSignals.supplierId, supplierId))
      .get();
    return row ?? null;
  },

  async listAllSupplierIds(d1: D1Database): Promise<string[]> {
    const db = getDb(d1);
    const rows = await db.select({ id: suppliers.id }).from(suppliers).all();
    return rows.map((r) => r.id);
  },
};

export const _internal = { sql };
