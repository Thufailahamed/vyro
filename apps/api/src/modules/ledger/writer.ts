import { getDb } from '@vyro/db';
import { ledgerEntries, type NewLedgerEntry } from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import { sql } from 'drizzle-orm';

export type AccountType = 'supplier' | 'business' | 'platform';
export type Direction = 'debit' | 'credit';
export type RefType = 'payment' | 'refund' | 'payout' | 'fee' | 'adjustment';

/**
 * Financial categories for double-entry readiness (spec §25). The legacy
 * refType column stays within its DB CHECK; the category carries the richer
 * event kind (SALE, COMMISSION, SETTLEMENT, PAYOUT, CREDIT, DEBIT, ...).
 */
export type LedgerCategory =
  | 'PAYMENT'
  | 'PAYMENT_FEE'
  | 'SALE'
  | 'COMMISSION'
  | 'REFUND'
  | 'REFUND_ADJUSTMENT'
  | 'SETTLEMENT'
  | 'PAYOUT'
  | 'CREDIT'
  | 'DEBIT'
  | 'MANUAL_ADJUSTMENT';

export interface LedgerWriteInput {
  accountType: AccountType;
  accountId: string;
  direction: Direction;
  amountCents: number;
  currency?: string;
  refType: RefType;
  refId: string;
  description: string;
  createdByUserId?: string | null;
  category?: LedgerCategory | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Insert one ledger entry. Must be called inside an existing DB transaction
 * (use db.transaction(cb) at the call site so payment-state changes and
 * ledger writes commit or roll back together).
 *
 * Accepts a Drizzle transaction handle from `db.transaction(...)`.
 */
export function writeLedgerEntry(
  tx: ReturnType<typeof getDb>,
  input: LedgerWriteInput,
): void {
  if (input.amountCents <= 0) {
    throw new Error('ledger entry amount must be positive');
  }
  const row: NewLedgerEntry = {
    id: newId(),
    accountType: input.accountType,
    accountId: input.accountId,
    direction: input.direction,
    amountCents: input.amountCents,
    currency: input.currency ?? 'LKR',
    refType: input.refType,
    refId: input.refId,
    category: input.category ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 2000) : null,
    description: input.description.slice(0, 500),
    createdByUserId: input.createdByUserId ?? null,
    createdAt: Date.now(),
  };
  tx.insert(ledgerEntries).values(row).run();
}

/**
 * Compute current balance for an account.
 * balance = SUM(credit) - SUM(debit) in cents.
 */
export async function computeBalance(
  db: ReturnType<typeof getDb>,
  accountType: AccountType,
  accountId: string,
  asOf?: number,
): Promise<number> {
  const condition = asOf
    ? sql`account_type = ${accountType} AND account_id = ${accountId} AND created_at <= ${asOf}`
    : sql`account_type = ${accountType} AND account_id = ${accountId}`;
  const row = (await db
    .select({
      credit: sql<number>`COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE 0 END), 0)`,
      debit: sql<number>`COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE 0 END), 0)`,
    })
    .from(ledgerEntries)
    .where(condition)
    .get()) as any;
  if (!row) return 0;
  return Number(row.credit) - Number(row.debit);
}

/**
 * Multi-account balance lookup. Useful for dashboard tiles.
 */
export async function computeBalances(
  db: ReturnType<typeof getDb>,
  accounts: Array<{ accountType: AccountType; accountId: string }>,
): Promise<Array<{ accountType: AccountType; accountId: string; balanceCents: number }>> {
  const out: Array<{ accountType: AccountType; accountId: string; balanceCents: number }> = [];
  for (const a of accounts) {
    out.push({
      accountType: a.accountType,
      accountId: a.accountId,
      balanceCents: await computeBalance(db, a.accountType, a.accountId),
    });
  }
  return out;
}
