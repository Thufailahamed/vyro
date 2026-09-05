import { getDb } from '@vyro/db';
import { ledgerEntries } from '@vyro/db/schema';
import { and, eq, gte, lte, sum } from 'drizzle-orm';

export type LedgerSummary = {
  totalDebitCents: number;
  totalCreditCents: number;
  netCents: number;
  byAccountType: Array<{
    accountType: 'supplier' | 'business' | 'platform';
    debitCents: number;
    creditCents: number;
    netCents: number;
  }>;
  byRefType: Array<{
    refType: 'payment' | 'refund' | 'payout' | 'fee' | 'adjustment';
    totalCents: number;
  }>;
};

export async function summary(
  d1: D1Database,
  opts: { from?: number | undefined; to?: number | undefined },
): Promise<LedgerSummary> {
  const db = getDb(d1);
  const where = and(
    opts.from ? gte(ledgerEntries.createdAt, opts.from) : undefined,
    opts.to ? lte(ledgerEntries.createdAt, opts.to) : undefined,
  );
  const all = (await db.select().from(ledgerEntries).where(where).all()) as Array<{
    accountType: 'supplier' | 'business' | 'platform';
    direction: 'debit' | 'credit';
    amountCents: number;
    refType: 'payment' | 'refund' | 'payout' | 'fee' | 'adjustment';
  }>;
  const accMap = new Map<string, { debit: number; credit: number }>();
  const refMap = new Map<string, number>();
  let totalDebit = 0;
  let totalCredit = 0;
  for (const r of all) {
    if (r.direction === 'debit') totalDebit += r.amountCents;
    else totalCredit += r.amountCents;
    const a = accMap.get(r.accountType) ?? { debit: 0, credit: 0 };
    if (r.direction === 'debit') a.debit += r.amountCents;
    else a.credit += r.amountCents;
    accMap.set(r.accountType, a);
    refMap.set(r.refType, (refMap.get(r.refType) ?? 0) + r.amountCents);
  }
  return {
    totalDebitCents: totalDebit,
    totalCreditCents: totalCredit,
    netCents: totalCredit - totalDebit,
    byAccountType: Array.from(accMap.entries()).map(([k, v]) => ({
      accountType: k as 'supplier' | 'business' | 'platform',
      debitCents: v.debit,
      creditCents: v.credit,
      netCents: v.credit - v.debit,
    })),
    byRefType: Array.from(refMap.entries()).map(([k, v]) => ({
      refType: k as 'payment' | 'refund' | 'payout' | 'fee' | 'adjustment',
      totalCents: v,
    })),
  };
}

// Reference sum() to satisfy unused-import warning when callers extend.
void sum;
void eq;
