import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers } from '@vyro/db/schema';
import { trustRepository } from './repository';
import { computeTrustSignal, sampleGateMeetsOnTimeBadge } from './compute';

const TRAILING_DELIVERY_WINDOW = 30;
const DISPUTE_WINDOW_DAYS = 90;

export interface TrustSignalView {
  kyc: boolean;
  memberSinceYear: number | null;
  onTimePct: number | null;
  onTimeSampleSize: number;
  disputeFree: boolean;
  lastComputedAt: number | null;
}

function emptyView(): TrustSignalView {
  return {
    kyc: false,
    memberSinceYear: null,
    onTimePct: null,
    onTimeSampleSize: 0,
    disputeFree: false,
    lastComputedAt: null,
  };
}

async function loadSupplierFacts(d1: D1Database, supplierId: string, nowMs: number) {
  const db = getDb(d1);
  const sup = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!sup) return null;

  // Raw aggregates — aggregate + LIMIT combination is awkward with the
  // drizzle D1 builder; the SQL is clearer and matches the cron budget.
  const deliveryRow = await d1
    .prepare(
      `SELECT count(*) AS total,
              sum(case when delivered_at <= delivery_promised_at then 1 else 0 end) AS on_time
       FROM purchase_orders
       WHERE supplier_id = ?1 AND status = 'delivered' AND delivery_promised_at IS NOT NULL
       ORDER BY delivered_at DESC
       LIMIT ?2`,
    )
    .bind(supplierId, TRAILING_DELIVERY_WINDOW)
    .first<{ total: number; on_time: number | null }>()
    .catch(() => null);

  const cutoffSec = Math.floor((nowMs - DISPUTE_WINDOW_DAYS * 86400 * 1000) / 1000);
  const disputedRow = await d1
    .prepare(
      `SELECT count(*) AS n
       FROM purchase_orders
       WHERE supplier_id = ?1 AND dispute_outcome = 'refund_business' AND disputed_at >= ?2`,
    )
    .bind(supplierId, cutoffSec)
    .first<{ n: number }>()
    .catch(() => null);

  return {
    supplier: sup,
    totalCompletedPos: Number(deliveryRow?.total ?? 0),
    onTimeCount: Number(deliveryRow?.on_time ?? 0),
    disputedSupplierFaultCount: Number(disputedRow?.n ?? 0),
  };
}

export async function recomputeForSupplier(
  d1: D1Database,
  supplierId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const facts = await loadSupplierFacts(d1, supplierId, nowMs);
  if (!facts) return;
  const { supplier } = facts;
  const computed = computeTrustSignal({
    supplierCreatedAt: (supplier as { createdAt?: number | null }).createdAt ?? null,
    kycVerified: (supplier as { verificationStatus?: string }).verificationStatus === 'verified',
    totalCompletedPos: facts.totalCompletedPos,
    onTimeCount: facts.onTimeCount,
    disputedSupplierFaultCount90d: facts.disputedSupplierFaultCount,
    now: nowMs,
  });
  await trustRepository.upsert(d1, { ...computed, supplierId });
}

export async function recomputeAllSuppliers(
  d1: D1Database,
  nowMs: number = Date.now(),
): Promise<{ rebuilt: number; failed: number }> {
  const ids = await trustRepository.listAllSupplierIds(d1);
  let rebuilt = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await recomputeForSupplier(d1, id, nowMs);
      rebuilt++;
    } catch (e) {
      failed++;
      // eslint-disable-next-line no-console
      console.error('[trust] recompute failed for supplier', id, e);
    }
  }
  return { rebuilt, failed };
}

export async function getTrustSignalView(
  d1: D1Database,
  supplierId: string,
): Promise<TrustSignalView> {
  const row = await trustRepository.getBySupplierId(d1, supplierId);
  if (!row) return emptyView();
  const meetsSample = sampleGateMeetsOnTimeBadge(row.totalCompletedPos);
  return {
    kyc: row.kycVerified === 1,
    memberSinceYear: row.memberSinceYear ?? null,
    onTimePct:
      meetsSample && row.onTimePctCached != null
        ? Math.round(row.onTimePctCached * 100)
        : null,
    onTimeSampleSize: row.totalCompletedPos,
    disputeFree: row.disputedSupplierFaultCount === 0,
    lastComputedAt: row.computedAt,
  };
}
