import { describe, it, expect, vi } from 'vitest';
import { searchPayments, getPaymentDetailBundle, listPaymentOptions } from '../../src/modules/admin/payments/paymentSearchRepository';

// Recursive stub that mirrors a Drizzle join chain. Terminals resolve the
// supplied rows; intermediate methods return the same chain object.
function makeDb(rows: any[]) {
  const chain: any = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.leftJoin = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = () => chain;
  chain.offset = () => chain;
  chain.all = vi.fn().mockResolvedValue(rows);
  chain.get = vi.fn().mockResolvedValue(rows[0] ?? null);
  const select = vi.fn().mockReturnValue(chain);
  return { select, _chain: chain } as any;
}

function makeDbAllResults(...results: any[]) {
  let i = 0;
  const chain: any = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.leftJoin = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = () => chain;
  chain.offset = () => chain;
  chain.all = vi.fn().mockImplementation(() => Promise.resolve(results[i++] ?? []));
  chain.get = vi.fn().mockImplementation(() => Promise.resolve(results[i++] ?? null));
  return { select: vi.fn().mockReturnValue(chain) } as any;
}

// Per-call chain factory: each select() invocation gets its own chain with
// pre-baked get/all responses. Order in `chains` must match the call order.
function makeDbWithChains(...chains: Array<{ get?: any; all?: any }>) {
  let i = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      const spec = chains[i++] ?? {};
      const c: any = {};
      c.from = () => c;
      c.innerJoin = () => c;
      c.leftJoin = () => c;
      c.where = () => c;
      c.orderBy = () => c;
      c.limit = () => c;
      c.offset = () => c;
      c.get = vi.fn().mockImplementation(() => Promise.resolve(spec.get ?? null));
      c.all = vi.fn().mockImplementation(() => Promise.resolve(spec.all ?? []));
      return c;
    }),
  } as any;
}

describe('searchPayments', () => {
  it('returns rows + nextCursor when limit+1 rows returned', async () => {
    const rows = [
      { id: 'p1', createdAt: 100, amountCents: 500 },
      { id: 'p2', createdAt: 50, amountCents: 300 },
    ];
    const db = makeDb(rows);
    const out = await searchPayments(db, { limit: 1 });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].id).toBe('p1');
    expect(out.nextCursor).not.toBeNull();
  });

  it('nulls nextCursor when fewer than limit rows', async () => {
    const db = makeDb([{ id: 'p1', createdAt: 100, amountCents: 500 }]);
    const out = await searchPayments(db, { limit: 5 });
    expect(out.rows).toHaveLength(1);
    expect(out.nextCursor).toBeNull();
  });

  it('parses opaque cursor (does not throw on bad input)', async () => {
    const cursor = Buffer.from('100:p1').toString('base64url');
    const db = makeDb([{ id: 'p0', createdAt: 50, amountCents: 100 }]);
    await expect(searchPayments(db, { cursor, limit: 1 })).resolves.toBeDefined();
  });

  it('treats garbage cursor as no cursor', async () => {
    const db = makeDb([{ id: 'p1', createdAt: 100, amountCents: 500 }]);
    await expect(searchPayments(db, { cursor: '!!not-base64!!', limit: 1 })).resolves.toBeDefined();
  });
});

describe('getPaymentDetailBundle', () => {
  it('returns null when payment missing', async () => {
    const db = makeDb([]);
    const out = await getPaymentDetailBundle(db, 'missing');
    expect(out).toBeNull();
  });

  it('returns bundle when payment present + fans out linked tables', async () => {
    const head = {
      id: 'pay-1', purchaseOrderId: 'po-1', poNumber: 'PO-1',
      businessId: 'b1', businessName: 'Biz', supplierId: 's1', supplierName: 'Sup',
      amountCents: 50000, feeCents: 1000, netCents: 49000, currency: 'LKR',
      status: 'confirmed', method: 'online', transactionReference: null, gatewayRef: null,
      paidAt: 1, confirmedAt: 2, createdAt: 3,
      statusReason: null, idempotencyKey: null, gatewayPayload: null,
      confirmedByUserId: null, notes: null, updatedAt: 4,
    };
    // Order of select() calls in getPaymentDetailBundle:
    //   1. head (join chain + get)
    //   2. refunds ids (where + all) → []
    //   3. ledgerQuery build (when refundIds empty, second branch runs select() at build time)
    //   4-9. Promise.all: poRow, bizRow, supRow (each get), refundRows, cbRows,
    //        ledgerRows (each all on the chain built in step 3)
    const db = makeDbWithChains(
      { get: head },                 // 1. head
      { all: [] },                   // 2. refunds ids (none)
      { all: [] },                   // 3. ledger build
      { get: { id: 'po-1', poNumber: 'PO-1', status: 'delivered', totalCents: 50000, createdAt: 1, deliveryAt: 9 } }, // 4. po
      { get: { id: 'b1', name: 'Biz', email: 'b@x' } }, // 5. business
      { get: { id: 's1', name: 'Sup', email: 's@x' } }, // 6. supplier
      { all: [] },                   // 7. refunds rows
      { all: [] },                   // 8. chargebacks rows
      // 9. ledger rows: ledgerQuery.all() uses the chain returned by select #3
    );
    const out = await getPaymentDetailBundle(db, 'pay-1');
    expect(out).not.toBeNull();
    expect(out!.payment.id).toBe('pay-1');
    expect(out!.purchaseOrder?.poNumber).toBe('PO-1');
    expect(out!.business?.name).toBe('Biz');
    expect(out!.supplier?.name).toBe('Sup');
    expect(out!.refunds).toEqual([]);
    expect(out!.chargebacks).toEqual([]);
    expect(out!.ledger).toEqual([]);
  });
});

describe('listPaymentOptions', () => {
  it('returns businesses + suppliers', async () => {
    const db = makeDbAllResults(
      [{ id: 'b1', name: 'Biz' }],
      [{ id: 's1', name: 'Sup' }],
    );
    const out = await listPaymentOptions(db);
    expect(out.businesses).toEqual([{ id: 'b1', name: 'Biz' }]);
    expect(out.suppliers).toEqual([{ id: 's1', name: 'Sup' }]);
  });
});
