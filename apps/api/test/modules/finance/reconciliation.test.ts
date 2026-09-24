import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory table fixtures. We key them by the schema's `.name` property so the
// generic drizzle chain below can resolve any table to its seeded rows.
const tables: Record<string, any[]> = {
  payments: [],
  purchase_orders: [],
  refunds: [],
  bank_transfers: [],
  cod_collections: [],
  supplier_earnings: [],
  settlements: [],
  settlement_items: [],
  payouts: [],
  reconciliation_exceptions: [],
};

// One fluent chain handler shared across every select/from/where call so that
// runReconciliation's nine sections can all query the mocked db without
// exploding. `.all()` returns the rows for the current table; `.get()` returns
// the first row (or undefined).
function makeChain(tableName: string): any {
  const rows = tables[tableName] ?? [];
  const chain: any = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = () => chain;
  chain.get = async () => rows[0];
  chain.all = async () => rows;
  return chain;
}

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: (_fields?: unknown) => ({
      from: (t: any) => makeChain(t?.name ?? String(t)),
    }),
  }),
}));

vi.mock('@vyro/db/schema', () => ({
  payments: { name: 'payments' },
  purchaseOrders: { name: 'purchase_orders' },
  refunds: { name: 'refunds' },
  bankTransfers: { name: 'bank_transfers' },
  codCollections: { name: 'cod_collections' },
  supplierEarnings: { name: 'supplier_earnings' },
  settlements: { name: 'settlements' },
  settlementItems: { name: 'settlement_items' },
  payouts: { name: 'payouts' },
  reconciliationExceptions: { name: 'reconciliation_exceptions' },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => '...',
  eq: () => '...',
  sql: () => '...',
  desc: () => '...',
}));

// Mock raiseException so we don't need to model the dedupe/insert path of the
// real repository. The test asserts against this spy.
const raiseException = vi.fn(async () => ({ id: 'exc-stub' }));
vi.mock('../../../src/modules/finance/repository', () => ({
  raiseException: (...args: unknown[]) => raiseException(...args),
}));

// Import after the mocks above so module init sees them.
import { runReconciliation } from '../../../src/modules/finance/reconciliation';

describe('runReconciliation section #4 — confirmed payment vs PO total', () => {
  beforeEach(() => {
    raiseException.mockClear();
    // Wipe all tables between tests, then seed only what section #4 cares about.
    for (const k of Object.keys(tables)) tables[k] = [];
    tables.payments = [
      // `amount` is the alias section #4 uses in its `.select({ ... amount: payments.amountCents })`.
      { id: 'pay-1', purchaseOrderId: 'po-1', amount: 9999, amountCents: 9999, status: 'confirmed' },
    ];
    tables.purchase_orders = [
      { id: 'po-1', poNumber: 'PO-1', totalCents: 10000, status: 'confirmed' },
    ];
  });

  it('raises an amount_mismatch exception when a confirmed payment disagrees with the PO total', async () => {
    const result = await runReconciliation({} as D1Database);

    const mismatchCalls = raiseException.mock.calls.filter(
      ([, input]: [unknown, { kind: string }]) => input?.kind === 'amount_mismatch',
    );
    expect(mismatchCalls.length).toBe(1);
    expect(mismatchCalls[0][1]).toMatchObject({
      kind: 'amount_mismatch',
      entityType: 'payment',
      entityId: 'pay-1',
      expectedCents: 10000,
      actualCents: 9999,
    });
    expect(result.byKind.amount_mismatch).toBe(1);
  });
});