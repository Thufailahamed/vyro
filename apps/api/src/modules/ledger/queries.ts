import { getDb } from '@vyro/db';
import { ledgerEntries, type LedgerEntry } from '@vyro/db/schema';
import { and, eq, gte, lte, lt, sql } from 'drizzle-orm';
import type { AccountType } from './writer';

export interface StatementQuery {
  accountType: AccountType;
  accountId: string;
  from?: number | undefined;
  to?: number | undefined;
  /**
   * Opaque keyset cursor: "<createdAt>_<id>". A bare timestamp was not a safe
   * cursor — several ledger legs are written in one transaction and share a
   * millisecond, so `createdAt < cursor` silently skipped the rest of that
   * group on the next page.
   */
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface StatementPage {
  entries: Array<LedgerEntry & { runningBalanceCents: number }>;
  nextCursor: string | null;
  openingBalanceCents: number;
  closingBalanceCents: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function encodeLedgerCursor(entry: { createdAt: number; id: string }): string {
  return `${entry.createdAt}_${entry.id}`;
}

/** Accepts the composite cursor and the legacy bare timestamp. */
export function decodeLedgerCursor(
  raw: string | undefined,
): { createdAt: number; id: string | null } | null {
  if (!raw) return null;
  const sep = raw.lastIndexOf('_');
  if (sep > 0) {
    const createdAt = Number(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isFinite(createdAt) && id) return { createdAt, id };
  }
  const legacy = Number(raw);
  if (Number.isFinite(legacy)) return { createdAt: legacy, id: null };
  return null;
}

/**
 * Paginated statement with running balance. The cursor is a keyset over
 * (createdAt, id) so entries written in the same millisecond are never
 * dropped between pages.
 */
export async function listStatement(
  db: ReturnType<typeof getDb>,
  q: StatementQuery,
): Promise<StatementPage> {
  const limit = Math.min(q.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const conditions = [
    eq(ledgerEntries.accountType, q.accountType),
    eq(ledgerEntries.accountId, q.accountId),
  ];
  if (q.from !== undefined) conditions.push(gte(ledgerEntries.createdAt, q.from));
  if (q.to !== undefined) conditions.push(lte(ledgerEntries.createdAt, q.to));
  const cursor = decodeLedgerCursor(q.cursor);
  if (cursor) {
    if (cursor.id) {
      conditions.push(
        sql`(${ledgerEntries.createdAt} < ${cursor.createdAt} OR (${ledgerEntries.createdAt} = ${cursor.createdAt} AND ${ledgerEntries.id} < ${cursor.id}))`,
      );
    } else {
      conditions.push(lt(ledgerEntries.createdAt, cursor.createdAt));
    }
  }

  const rows = (await db
    .select()
    .from(ledgerEntries)
    .where(and(...conditions))
    .orderBy(sql`${ledgerEntries.createdAt} desc, ${ledgerEntries.id} desc`)
    .limit(limit + 1)
    .all()) as any;

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);

  // Opening balance = everything before the page's earliest entry, for this
  // account. Computed independently of the page contents so an empty page
  // (cursor past the end) still reports the real balance instead of 0.
  const balanceCondition = [
    eq(ledgerEntries.accountType, q.accountType),
    eq(ledgerEntries.accountId, q.accountId),
  ];
  if (pageRows.length > 0) {
    const earliest = pageRows[pageRows.length - 1];
    balanceCondition.push(
      sql`(${ledgerEntries.createdAt} < ${earliest.createdAt} OR (${ledgerEntries.createdAt} = ${earliest.createdAt} AND ${ledgerEntries.id} < ${earliest.id}))`,
    );
  }
  const opening = (await db
    .select({
      credit: sql<number>`COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE 0 END), 0)`,
      debit: sql<number>`COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE 0 END), 0)`,
    })
    .from(ledgerEntries)
    .where(and(...balanceCondition))
    .get()) as any;
  const openingBalanceCents = Number(opening?.credit ?? 0) - Number(opening?.debit ?? 0);

  // Walking balance: the page is desc, so iterate in reverse to compute it.
  let running = openingBalanceCents;
  const entriesAsc = [...pageRows].reverse();
  for (const row of entriesAsc) {
    if (row.direction === 'credit') running += row.amountCents;
    else running -= row.amountCents;
  }
  const closingBalanceCents = running;

  // Per-row running balance (as-of this entry)
  let accFromClosing = closingBalanceCents;
  const entriesWithRunning = pageRows.map((row: (typeof pageRows)[number]) => {
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
    nextCursor:
      hasMore && pageRows.length > 0
        ? encodeLedgerCursor(pageRows[pageRows.length - 1] as { createdAt: number; id: string })
        : null,
    openingBalanceCents,
    closingBalanceCents,
  };
}
