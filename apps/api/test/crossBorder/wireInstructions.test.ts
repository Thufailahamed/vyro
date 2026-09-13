import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakePoByBusinessId: Record<string, any> = {};
const fakeFxSnapshots: Record<string, any> = {};
const fakeUpdates: any[] = [];
const fakeAudits: any[] = [];

function chainable(rows: any[]) {
  const c: any = {
    from: () => c,
    where: () => c,
    limit: () => c,
    all: async () => rows,
    get: async () => rows[0],
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return c;
}

const h = vi.hoisted(() => {
  const fakePoByBusinessId: Record<string, any> = {};
  const fakeFxSnapshots: Record<string, any> = {};
  const fakeUpdates: any[] = [];
  const fakeAudits: any[] = [];
  let selectCalls = 0;
  function chainable(rows: any[]) {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: () => c,
      all: async () => rows,
      get: async () => rows[0],
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    };
    return c;
  }
  const dbStub: any = {
    select: (_table: any) => {
      // Wire service calls select twice — once for PO, optionally once for FX snapshot.
      // Track call count via a counter on the stub.
      selectCalls += 1;
      if (selectCalls % 2 === 1) return chainable(Object.values(fakePoByBusinessId));
      return chainable(Object.values(fakeFxSnapshots));
    },
    update: (_table: any) => ({
      set: (v: any) => {
        const q: any = {
          where: (_cond: any) => q,
          run: async () => {
            fakeUpdates.push({ values: v });
          },
          then: (resolve: any, reject: any) => {
            fakeUpdates.push({ values: v });
            return Promise.resolve(undefined).then(resolve, reject);
          },
        };
        return q;
      },
    }),
  };
  return { dbStub, fakePoByBusinessId, fakeFxSnapshots, fakeUpdates, fakeAudits, getSelectCalls: () => selectCalls, resetSelectCalls: () => { selectCalls = 0; } };
});

vi.mock('@vyro/db', () => ({
  getDb: () => h.dbStub,
}));

vi.mock('../../src/modules/supplierProducts/repository', () => ({
  recordAudit: async (_db: any, v: any) => {
    h.fakeAudits.push(v);
  },
}));

vi.mock('../../src/lib/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

vi.mock('../../src/lib/metrics', () => ({
  metric: () => {},
}));

import { buildWireInstructions, suggestReference } from '../../src/modules/cross-border/wireInstructions';

const baseEnv = {
  VYRO_BANK_BENEFICIARY_NAME: 'Vyro Wholesale (Pvt) Ltd',
  VYRO_BANK_BENEFICIARY_ADDRESS: '12 Marine Drive, Colombo 03',
  VYRO_BANK_NAME: 'Bank of Ceylon',
  VYRO_BANK_ADDRESS: 'York Street, Colombo 01',
  VYRO_BANK_ACCOUNT_NUMBER: '0001234567',
  VYRO_BANK_SWIFT_BIC: 'BABORCEK',
  VYRO_BANK_IBAN: 'LK76BABC0001234567',
  VYRO_BANK_INTERMEDIARY_NAME: 'Citibank NA',
  VYRO_BANK_INTERMEDIARY_SWIFT: 'CITIUS33',
  VYRO_BANK_REFERENCE_PREFIX: 'VYRO',
  DB: {},
} as any;

describe('wireInstructions', () => {
  beforeEach(() => {
    Object.keys(h.fakePoByBusinessId).forEach((k) => delete h.fakePoByBusinessId[k]);
    Object.keys(h.fakeFxSnapshots).forEach((k) => delete h.fakeFxSnapshots[k]);
    h.fakeUpdates.length = 0;
    h.fakeAudits.length = 0;
    h.resetSelectCalls();
  });

  it('throws NOT_FOUND when PO not found', async () => {
    await expect(
      buildWireInstructions(baseEnv, { poId: 'missing', businessId: 'b1', userId: 'u1' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects domestic orders', async () => {
    h.fakePoByBusinessId['p1'] = {
      id: 'p1',
      poNumber: 'PO-1',
      businessId: 'b1',
      supplierId: 's1',
      direction: 'domestic',
      totalCents: 100000,
      fxSnapshotId: null,
    };
    await expect(
      buildWireInstructions(baseEnv, { poId: 'p1', businessId: 'b1', userId: 'u1' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('builds wire instructions and stamps paymentMethod=wire', async () => {
    h.fakePoByBusinessId['p2'] = {
      id: 'p2',
      poNumber: 'PO-2',
      businessId: 'b1',
      supplierId: 's1',
      direction: 'export',
      totalCents: 250000,
      fxSnapshotId: null,
    };
    const out = await buildWireInstructions(baseEnv, {
      poId: 'p2',
      businessId: 'b1',
      userId: 'u1',
    });
    expect(out.paymentMethod).toBe('wire');
    expect(out.totalLkrCents).toBe(250000);
    expect(out.beneficiary.swiftBic).toBe('BABORCEK');
    expect(out.beneficiary.reference).toBe('VYRO-PO-2');
    const stamp = h.fakeUpdates.find((u: any) => u.values.paymentMethod === 'wire');
    expect(stamp).toBeTruthy();
    expect(stamp.values.paymentInitiatedByUserId).toBe('u1');
    const audit = h.fakeAudits.find((a: any) => a.action === 'cross_border.wire_initiated');
    expect(audit).toBeTruthy();
  });

  it('throws 503 when wire not configured', async () => {
    h.fakePoByBusinessId['p3'] = {
      id: 'p3',
      poNumber: 'PO-3',
      businessId: 'b1',
      supplierId: 's1',
      direction: 'import',
      totalCents: 1000,
      fxSnapshotId: null,
    };
    await expect(
      buildWireInstructions({ ...baseEnv, VYRO_BANK_BENEFICIARY_NAME: '' } as any, {
        poId: 'p3',
        businessId: 'b1',
        userId: 'u1',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('suggestReference uses prefix', () => {
    expect(suggestReference('PO-X', 'FOO')).toBe('FOO-PO-X');
    expect(suggestReference('PO-Y')).toBe('VYRO-PO-Y');
  });
});
