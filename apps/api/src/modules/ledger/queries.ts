import { getDb } from '@vyro/db';
import { ledgerEntries, type LedgerEntry } from '@vyro/db/schema';
import { and, eq, gte, lte, lt, sql } from 'drizzle-orm';
import type { AccountType } from './writer';

export interface StatementQuery {
  accountType: AccountType;
  accountId: string;
  from?: number | undefined;
  to?: number | undefined;
  cursor?: number | undefined; // createdAt of last entry from prior page
  limit?: number | undefined;
}

export interface StatementPage {
  entries: Array<LedgerEntry & { runningBalanceCents: number }>;
  nextCursor: number | null;
  openingBalanceCents: number;
  closingBalanceCents: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Paginated statement with running balance. Cursor is the createdAt of the
 * last item from the prior page (lt for desc).
 */
export async function listStatement(db: ReturnType<typeof getDb>, q: StatementQuery): Promise<StatementPage> {
  const limit = Math.min(q.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const conditions = [eq(ledgerEntries.accountType, q.accountType), eq(ledgerEntries.accountId, q.accountId)];
  if (q.from !== undefined) conditions.push(gte(ledgerEntries.createdAt, q.from));
  if (q.to !== undefined) conditions.push(lte(ledgerEntries.createdAt, q.to));
  if (q.cursor !== undefined) conditions.push(lt(ledgerEntries.createdAt, q.cursor));

  const rows = (await db
    .select()
    .from(ledgerEntries)
    .where(and(...conditions))
    .orderBy(sql`${ledgerEntries.createdAt} desc`)
    .limit(limit + 1)
    .all()) as any;

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);

  // Opening balance = sum of entries before the page's earliest item, within window
  let openingBalanceCents = 0;
  if (pageRows.length > 0) {
    const earliest = pageRows[pageRows.length - 1].createdAt;
    const openingCondition = [
      eq(ledgerEntries.accountType, q.accountType),
      eq(ledgerEntries.accountId, q.accountId),
      lt(ledgerEntries.createdAt, earliest),
    ];
    if (q.from !== undefined) {
      // (no-op; opening should include all prior regardless of from filter for correctness)
    }
    const opening = (await db
      .select({
        credit: sql<number>`COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE 0 END), 0)`,
        debit: sql<number>`COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE 0 END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(...openingCondition))
      .get()) as any;
    openingBalanceCents = Number(opening?.credit ?? 0) - Number(opening?.debit ?? 0);
  }

  // Walking balance: page is desc, so iterate in reverse to compute running balance
  let running = openingBalanceCents;
  const entriesAsc = [...pageRows].reverse();
  for (const row of entriesAsc) {
    if (row.direction === 'credit') running += row.amountCents;
    else running -= row.amountCents;
  }
  // After walking all, running = closing balance if no items past page
  // For per-row runningBalance, iterate desc and subtract as we go
  const closingBalanceCents = running;

  // Per-row running balance (as-of this entry)
  let accFromClosing = closingBalanceCents;
  const entriesWithRunning = pageRows.map((row: typeof pageRows[number]) => {
    const entry: LedgerEntry & { runningBalanceCents: number } = {
      ...row,
      runningBalanceCents: accFromClosing,
    };
    if (row.direction === 'credit') accFromClosing -= row.amountCents;
    else accFromClosing += row.amountCents;
    return entry;
  });

  return {
    entries: entriesWithRunning,
    nextCursor: hasMore ? pageRows[pageRows.length - 1].createdAt : null,
    openingBalanceCents,
    closingBalanceCents,
  };
}
