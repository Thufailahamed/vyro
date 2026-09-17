import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, purchaseOrders } from '@vyro/db/schema';
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

  const delivery = await db
    .select({
      total: sql<number>`count(*)`,
      onTime: sql<number>`sum(case when ${purchaseOrders.deliveredAt} <= ${purchaseOrders.deliveryPromisedAt} then 1 else 0 end)`,
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        eq(purchaseOrders.status, 'delivered'),
        isNotNull(purchaseOrders.deliveryPromisedAt),
      ),
    )
    .orderBy(sql`${purchaseOrders.deliveredAt} desc`)
    .limit(TRAILING_DELIVERY_WINDOW)
    .get();

  const cutoff = nowMs - DISPUTE_WINDOW_DAYS * 86400 * 1000;
  const disputedRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        eq(purchaseOrders.disputeOutcome, 'refund_business'),
        gte(purchaseOrders.disputedAt, cutoff),
      ),
    )
    .get();

  return {
    supplier: sup,
    totalCompletedPos: Number(delivery?.total ?? 0),
    onTimeCount: Number(delivery?.onTime ?? 0),
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
