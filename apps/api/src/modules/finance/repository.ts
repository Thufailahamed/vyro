import { getDb } from '@vyro/db';
import {
  paymentAttempts,
  paymentAllocations,
  codCollections,
  bankTransfers,
  commissionRules,
  supplierEarnings,
  settlements,
  settlementItems,
  supplierBankAccounts,
  financialAdjustments,
  reconciliationExceptions,
  type NewPaymentAttempt,
  type NewCodCollection,
  type NewBankTransfer,
} from '@vyro/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { newId } from '@vyro/shared';

// --- Payment attempts (append-only) ---

export async function recordAttempt(
  d1: D1Database,
  input: Omit<NewPaymentAttempt, 'id' | 'createdAt' | 'attemptNumber'>,
) {
  const db = getDb(d1);
  const existing = (await db
    .select({ n: sql<number>`COALESCE(MAX(attempt_number), 0)` })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.paymentId, input.paymentId))
    .get()) as { n: number } | undefined;
  const attemptNumber = (existing?.n ?? 0) + 1;
  const now = Date.now();
  const row = {
    ...input,
    id: newId(),
    attemptNumber,
    initiatedAt: input.initiatedAt ?? now,
    createdAt: now,
  };
  await db.insert(paymentAttempts).values(row).run();
  return { ...row, attemptNumber };
}

export async function listAttempts(d1: D1Database, paymentId: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.paymentId, paymentId))
    .orderBy(desc(paymentAttempts.attemptNumber))
    .all()) as any[];
}

export async function completeAttempt(
  d1: D1Database,
  id: string,
  status: 'authorized' | 'paid' | 'failed' | 'cancelled' | 'expired',
  patch: { providerReference?: string | null; failureReason?: string | null } = {},
) {
  const db = getDb(d1);
  const now = Date.now();
  await db
    .update(paymentAttempts)
    .set({
      status,
      providerReference: patch.providerReference ?? undefined,
      failureReason: patch.failureReason ?? undefined,
      completedAt: now,
    })
    .where(eq(paymentAttempts.id, id))
    .run();
}

// --- Allocations ---

export async function createAllocations(
  d1: D1Database,
  rows: Array<{
    paymentId: string;
    supplierId: string;
    purchaseOrderId?: string | null;
    grossCents: number;
    commissionCents: number;
    commissionBps: number;
    feeCents: number;
    netCents: number;
    currency: string;
  }>,
) {
  if (rows.length === 0) return [];
  const db = getDb(d1);
  const now = Date.now();
  const prepared = rows.map((r) => ({ ...r, id: newId(), createdAt: now }));
  await db.insert(paymentAllocations).values(prepared).run();
  return prepared;
}

export async function listAllocations(d1: D1Database, paymentId: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, paymentId))
    .all()) as any[];
}

// --- COD collections ---

export async function ensureCodCollection(
  d1: D1Database,
  input: Omit<NewCodCollection, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const db = getDb(d1);
  const existing = (await db
    .select()
    .from(codCollections)
    .where(eq(codCollections.paymentId, input.paymentId))
    .get()) as any;
  if (existing) return existing;
  const now = Date.now();
  const row = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.insert(codCollections).values(row).run();
  return row;
}

export async function findCodByPayment(d1: D1Database, paymentId: string) {
  const db = getDb(d1);
  return ((await db
    .select()
    .from(codCollections)
    .where(eq(codCollections.paymentId, paymentId))
    .get()) as any) ?? null;
}

/** Optimistic-concurrency guarded update: only wins if status unchanged. */
export async function updateCodGuarded(
  d1: D1Database,
  id: string,
  expectedStatus: string,
  patch: Record<string, unknown>,
) {
  const db = getDb(d1);
  const res = await db
    .update(codCollections)
    .set({ ...patch, updatedAt: Date.now() })
    .where(and(eq(codCollections.id, id), eq(codCollections.status, expectedStatus as never)))
    .run();
  return (res as unknown as { meta?: { changes?: number } })?.meta?.changes === 1;
}

export async function listCodQueue(
  d1: D1Database,
  reconStatus: string | undefined,
  limit = 50,
  cursor?: number,
) {
  const db = getDb(d1);
  const conds: any[] = [];
  if (reconStatus) conds.push(eq(codCollections.reconciliationStatus, reconStatus as never));
  if (cursor !== undefined) conds.push(sql`${codCollections.createdAt} < ${cursor}`);
  return (await db
    .select()
    .from(codCollections)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(codCollections.createdAt))
    .limit(limit)
    .all()) as any[];
}

// --- Bank transfers ---

export async function createBankTransfer(
  d1: D1Database,
  input: Omit<NewBankTransfer, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const db = getDb(d1);
  const now = Date.now();
  const row = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.insert(bankTransfers).values(row).run();
  return row;
}

export async function findBankTransferByPayment(d1: D1Database, paymentId: string) {
  const db = getDb(d1);
  return ((await db
    .select()
    .from(bankTransfers)
    .where(eq(bankTransfers.paymentId, paymentId))
    .get()) as any) ?? null;
}

export async function findBankTransfer(d1: D1Database, id: string) {
  const db = getDb(d1);
  return ((await db.select().from(bankTransfers).where(eq(bankTransfers.id, id)).get()) as any) ?? null;
}

export async function updateBankTransferGuarded(
  d1: D1Database,
  id: string,
  expectedStatuses: string[],
  patch: Record<string, unknown>,
) {
  const db = getDb(d1);
  const current = await findBankTransfer(d1, id);
  if (!current || !expectedStatuses.includes(current.status)) return false;
  const res = await db
    .update(bankTransfers)
    .set({ ...patch, updatedAt: Date.now() })
    .where(and(eq(bankTransfers.id, id), eq(bankTransfers.status, current.status)))
    .run();
  return (res as unknown as { meta?: { changes?: number } })?.meta?.changes === 1;
}

export async function listBankTransferQueue(d1: D1Database, status: string | undefined, limit = 50, cursor?: number) {
  const db = getDb(d1);
  const conds: any[] = [];
  if (status) conds.push(eq(bankTransfers.status, status as never));
  if (cursor !== undefined) conds.push(sql`${bankTransfers.createdAt} < ${cursor}`);
  return (await db
    .select()
    .from(bankTransfers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(bankTransfers.createdAt))
    .limit(limit)
    .all()) as any[];
}

// --- Commission rules ---

export async function createCommissionRule(d1: D1Database, input: {
  scope: 'global' | 'category' | 'supplier' | 'product' | 'promotional';
  scopeId?: string | null;
  bps: number;
  name?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  createdByUserId?: string | null;
}) {
  const db = getDb(d1);
  const now = Date.now();
  const row = {
    id: newId(),
    scope: input.scope,
    scopeId: input.scopeId ?? null,
    bps: input.bps,
    name: input.name ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    active: true as const,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(commissionRules).values(row).run();
  return row;
}

export async function listCommissionRules(d1: D1Database) {
  const db = getDb(d1);
  return (await db.select().from(commissionRules).orderBy(desc(commissionRules.createdAt)).all()) as any[];
}

export async function setCommissionRuleActive(d1: D1Database, id: string, active: boolean) {
  const db = getDb(d1);
  await db.update(commissionRules).set({ active, updatedAt: Date.now() }).where(eq(commissionRules.id, id)).run();
}

// --- Earnings ---

export async function upsertEarningForPayment(
  d1: D1Database,
  input: {
    supplierId: string;
    paymentId: string;
    purchaseOrderId: string;
    allocationId?: string | null;
    grossCents: number;
    commissionBps: number;
    commissionCents: number;
    deliveryFeeCents?: number;
    processingFeeCents?: number;
    taxCents?: number;
    discountCents?: number;
    netCents: number;
    currency: string;
    eligibility?: 'ineligible' | 'eligible' | 'settled' | 'held';
    heldReason?: string | null;
  },
) {
  const db = getDb(d1);
  const existing = (await db
    .select()
    .from(supplierEarnings)
    .where(and(eq(supplierEarnings.paymentId, input.paymentId), eq(supplierEarnings.supplierId, input.supplierId)))
    .get()) as any;
  const now = Date.now();
  if (existing) {
    // Earnings rows are append-mostly: only eligibility + refund/adjustment
    // deltas mutate via dedicated paths. Never rewrite gross/commission.
    await db
      .update(supplierEarnings)
      .set({ eligibility: input.eligibility ?? existing.eligibility, heldReason: input.heldReason ?? existing.heldReason, updatedAt: now })
      .where(eq(supplierEarnings.id, existing.id))
      .run();
    return existing;
  }
  const row = {
    id: newId(),
    supplierId: input.supplierId,
    paymentId: input.paymentId,
    purchaseOrderId: input.purchaseOrderId,
    allocationId: input.allocationId ?? null,
    grossCents: input.grossCents,
    commissionBps: input.commissionBps,
    commissionCents: input.commissionCents,
    deliveryFeeCents: input.deliveryFeeCents ?? 0,
    processingFeeCents: input.processingFeeCents ?? 0,
    taxCents: input.taxCents ?? 0,
    discountCents: input.discountCents ?? 0,
    refundCents: 0,
    adjustmentCents: 0,
    netCents: input.netCents,
    currency: input.currency,
    eligibility: input.eligibility ?? ('ineligible' as const),
    heldReason: input.heldReason ?? null,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(supplierEarnings).values(row).run();
  return row;
}

export async function applyEarningRefundDelta(d1: D1Database, paymentId: string, supplierId: string, refundCents: number) {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(supplierEarnings)
    .where(and(eq(supplierEarnings.paymentId, paymentId), eq(supplierEarnings.supplierId, supplierId)))
    .get()) as any;
  if (!row) return null;
  const nextRefund = row.refundCents + refundCents;
  const nextNet = row.grossCents - row.commissionCents - row.processingFeeCents + row.adjustmentCents - nextRefund;
  await db
    .update(supplierEarnings)
    .set({ refundCents: nextRefund, netCents: nextNet, updatedAt: Date.now() })
    .where(eq(supplierEarnings.id, row.id))
    .run();
  return { ...row, refundCents: nextRefund, netCents: nextNet };
}

export async function listEarningsForSupplier(
  d1: D1Database,
  supplierId: string,
  opts: { eligibility?: string | undefined; limit?: number | undefined; cursor?: number | undefined } = {},
) {
  const db = getDb(d1);
  const conds: any[] = [eq(supplierEarnings.supplierId, supplierId)];
  if (opts.eligibility) conds.push(eq(supplierEarnings.eligibility, opts.eligibility as never));
  if (opts.cursor !== undefined) conds.push(sql`${supplierEarnings.createdAt} < ${opts.cursor}`);
  return (await db
    .select()
    .from(supplierEarnings)
    .where(and(...conds))
    .orderBy(desc(supplierEarnings.createdAt))
    .limit(opts.limit ?? 50)
    .all()) as any[];
}

export async function earningsSummary(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  const rows = (await db
    .select({
      eligibility: supplierEarnings.eligibility,
      gross: sql<number>`COALESCE(SUM(gross_cents),0)`,
      commission: sql<number>`COALESCE(SUM(commission_cents),0)`,
      refunds: sql<number>`COALESCE(SUM(refund_cents),0)`,
      adjustments: sql<number>`COALESCE(SUM(adjustment_cents),0)`,
      net: sql<number>`COALESCE(SUM(net_cents),0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(supplierEarnings)
    .where(eq(supplierEarnings.supplierId, supplierId))
    .all()) as any[];
  void desc;
  return rows;
}

// --- Settlements ---

export async function createSettlement(d1: D1Database, input: {
  settlementNumber: string;
  supplierId: string;
  grossCents: number;
  commissionCents: number;
  refundCents: number;
  adjustmentCents: number;
  netCents: number;
  currency: string;
  earningIds: string[];
  createdByUserId?: string | null;
  idempotencyKey?: string | null;
}) {
  const db = getDb(d1);
  const now = Date.now();
  const id = newId();
  // Atomic: settlement header + items + eligibility flips commit together,
  // so concurrent creators cannot double-attach the same earning (the
  // settlement_items.earning unique index is the backstop).
  await db.transaction(async (tx) => {
    await tx.insert(settlements).values({
      id,
      settlementNumber: input.settlementNumber,
      supplierId: input.supplierId,
      grossCents: input.grossCents,
      commissionCents: input.commissionCents,
      refundCents: input.refundCents,
      adjustmentCents: input.adjustmentCents,
      netCents: input.netCents,
      currency: input.currency,
      status: 'pending',
      idempotencyKey: input.idempotencyKey ?? null,
      createdByUserId: input.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
    for (const earningId of input.earningIds) {
      const earning = (await tx.select().from(supplierEarnings).where(eq(supplierEarnings.id, earningId)).get()) as any;
      if (!earning) throw new Error(`Earning not found: ${earningId}`);
      if (earning.eligibility !== 'eligible' || earning.supplierId !== input.supplierId) {
        throw new Error(`Earning not eligible: ${earningId}`);
      }
      await tx.insert(settlementItems).values({ id: newId(), settlementId: id, earningId, netCents: earning.netCents, createdAt: now }).run();
      await tx.update(supplierEarnings).set({ eligibility: 'settled', settledAt: now, updatedAt: now }).where(eq(supplierEarnings.id, earningId)).run();
    }
  });
  return (await db.select().from(settlements).where(eq(settlements.id, id)).get()) as any;
}

export async function findSettlement(d1: D1Database, id: string) {
  const db = getDb(d1);
  return ((await db.select().from(settlements).where(eq(settlements.id, id)).get()) as any) ?? null;
}

export async function findSettlementByIdempotency(d1: D1Database, key: string) {
  const db = getDb(d1);
  return ((await db.select().from(settlements).where(eq(settlements.idempotencyKey, key)).get()) as any) ?? null;
}

export async function setSettlementStatus(d1: D1Database, id: string, status: string, patch: Record<string, unknown> = {}) {
  const db = getDb(d1);
  await db.update(settlements).set({ status: status as never, ...patch, updatedAt: Date.now() }).where(eq(settlements.id, id)).run();
  return findSettlement(d1, id);
}

export async function listSettlements(d1: D1Database, supplierId: string | undefined, status: string | undefined, limit = 50, cursor?: number) {
  const db = getDb(d1);
  const conds: any[] = [];
  if (supplierId) conds.push(eq(settlements.supplierId, supplierId));
  if (status) conds.push(eq(settlements.status, status as never));
  if (cursor !== undefined) conds.push(sql`${settlements.createdAt} < ${cursor}`);
  return (await db
    .select()
    .from(settlements)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(settlements.createdAt))
    .limit(limit)
    .all()) as any[];
}

export async function listSettlementItems(d1: D1Database, settlementId: string) {
  const db = getDb(d1);
  return (await db.select().from(settlementItems).where(eq(settlementItems.settlementId, settlementId)).all()) as any[];
}

// --- Supplier bank accounts (masked reads) ---

export function maskBankAccount(row: any) {
  if (!row) return row;
  const { accountNumberHash, ...rest } = row;
  void accountNumberHash;
  return {
    ...rest,
    accountNumberMasked: `**** **** ${row.accountNumberLast4}`,
  };
}

export async function createSupplierBankAccount(d1: D1Database, input: {
  supplierId: string;
  bankName: string;
  accountHolder: string;
  accountNumberLast4: string;
  accountNumberHash: string;
  branch?: string | null;
  accountType?: string | null;
  createdByUserId?: string | null;
}) {
  const db = getDb(d1);
  const now = Date.now();
  const existing = (await db.select().from(supplierBankAccounts).where(eq(supplierBankAccounts.supplierId, input.supplierId)).all()) as any[];
  const row = {
    id: newId(),
    supplierId: input.supplierId,
    bankName: input.bankName,
    accountHolder: input.accountHolder,
    accountNumberLast4: input.accountNumberLast4,
    accountNumberHash: input.accountNumberHash,
    branch: input.branch ?? null,
    accountType: input.accountType ?? null,
    verificationStatus: 'pending' as const,
    isDefault: (existing.length === 0) as unknown as boolean,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(supplierBankAccounts).values(row).run();
  return maskBankAccount(row);
}

export async function listSupplierBankAccounts(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  const rows = (await db.select().from(supplierBankAccounts).where(eq(supplierBankAccounts.supplierId, supplierId)).all()) as any[];
  return rows.map(maskBankAccount);
}

// --- Adjustments ---

export async function createAdjustment(d1: D1Database, input: {
  adjustmentNumber: string;
  kind: 'credit' | 'debit';
  accountType: 'supplier' | 'business' | 'platform';
  accountId: string;
  amountCents: number;
  currency: string;
  entityType?: string | null;
  entityId?: string | null;
  reason: string;
  createdByUserId?: string | null;
  idempotencyKey?: string | null;
}) {
  const db = getDb(d1);
  const now = Date.now();
  const row = {
    id: newId(),
    adjustmentNumber: input.adjustmentNumber,
    kind: input.kind,
    accountType: input.accountType,
    accountId: input.accountId,
    amountCents: input.amountCents,
    currency: input.currency,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    reason: input.reason,
    status: 'pending' as const,
    idempotencyKey: input.idempotencyKey ?? null,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(financialAdjustments).values(row).run();
  return row;
}

export async function findAdjustment(d1: D1Database, id: string) {
  const db = getDb(d1);
  return ((await db.select().from(financialAdjustments).where(eq(financialAdjustments.id, id)).get()) as any) ?? null;
}

export async function setAdjustmentStatus(d1: D1Database, id: string, status: string, patch: Record<string, unknown> = {}) {
  const db = getDb(d1);
  await db.update(financialAdjustments).set({ status: status as never, ...patch, updatedAt: Date.now() }).where(eq(financialAdjustments.id, id)).run();
  return findAdjustment(d1, id);
}

export async function listAdjustments(d1: D1Database, accountType: string | undefined, accountId: string | undefined, limit = 50, cursor?: number) {
  const db = getDb(d1);
  const conds: any[] = [];
  if (accountType) conds.push(eq(financialAdjustments.accountType, accountType as never));
  if (accountId) conds.push(eq(financialAdjustments.accountId, accountId));
  if (cursor !== undefined) conds.push(sql`${financialAdjustments.createdAt} < ${cursor}`);
  return (await db
    .select()
    .from(financialAdjustments)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(financialAdjustments.createdAt))
    .limit(limit)
    .all()) as any[];
}

// --- Reconciliation exceptions ---

export async function raiseException(d1: D1Database, input: {
  kind: 'payment_without_order' | 'order_without_payment' | 'duplicate_payment' | 'amount_mismatch' | 'unmatched_bank_transfer' | 'cod_discrepancy' | 'earnings_mismatch' | 'settlement_mismatch' | 'payout_mismatch' | 'refund_mismatch';
  severity?: 'info' | 'warning' | 'critical';
  entityType?: string | null;
  entityId?: string | null;
  expectedCents?: number | null;
  actualCents?: number | null;
  differenceCents?: number;
  currency?: string;
  detail?: string | null;
}) {
  const db = getDb(d1);
  const now = Date.now();
  // Dedupe: don't reopen an identical open exception.
  const dup = (await db
    .select()
    .from(reconciliationExceptions)
    .where(
      and(
        eq(reconciliationExceptions.kind, input.kind),
        eq(reconciliationExceptions.status, 'open' as never),
        input.entityId ? eq(reconciliationExceptions.entityId, input.entityId) : undefined,
      ),
    )
    .get()) as any;
  if (dup && input.entityId) return dup;
  const row = {
    id: newId(),
    kind: input.kind,
    severity: input.severity ?? ('warning' as const),
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    expectedCents: input.expectedCents ?? null,
    actualCents: input.actualCents ?? null,
    differenceCents: input.differenceCents ?? 0,
    currency: input.currency ?? 'LKR',
    detail: input.detail ?? null,
    status: 'open' as const,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(reconciliationExceptions).values(row).run();
  return row;
}

export async function listExceptions(d1: D1Database, status: string | undefined, kind: string | undefined, limit = 50, cursor?: number) {
  const db = getDb(d1);
  const conds: any[] = [];
  if (status) conds.push(eq(reconciliationExceptions.status, status as never));
  if (kind) conds.push(eq(reconciliationExceptions.kind, kind as never));
  if (cursor !== undefined) conds.push(sql`${reconciliationExceptions.createdAt} < ${cursor}`);
  return (await db
    .select()
    .from(reconciliationExceptions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(reconciliationExceptions.createdAt))
    .limit(limit)
    .all()) as any[];
}

export async function resolveException(d1: D1Database, id: string, userId: string, note: string, status: 'resolved' | 'acknowledged' | 'dismissed' = 'resolved') {
  const db = getDb(d1);
  const now = Date.now();
  await db
    .update(reconciliationExceptions)
    .set({ status: status as never, resolvedByUserId: userId, resolvedAt: now, resolutionNote: note, updatedAt: now })
    .where(eq(reconciliationExceptions.id, id))
    .run();
  return (await db.select().from(reconciliationExceptions).where(eq(reconciliationExceptions.id, id)).get()) as any;
}
