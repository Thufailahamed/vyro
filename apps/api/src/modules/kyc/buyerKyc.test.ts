import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../../env';

interface FakeRow {
  id: string;
  countryCode: string;
  taxId?: string | null;
  kycLevel?: string;
}

const fakeRows: FakeRow[] = [];
const fakeUpdates: { whereId?: string; values: any }[] = [];
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

const dbStub = {
  select: () => chainable(fakeRows),
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
  insert: () => ({
    values: (v: any) => {
      fakeAudits.push(v);
      const q: any = {
        run: async () => {},
        then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
      };
      return q;
    },
  }),
};

vi.mock('@vyro/db', () => ({
  getDb: () => dbStub,
}));

vi.mock('../supplierProducts/repository', () => ({
  recordAudit: async (_db: any, v: any) => {
    fakeAudits.push(v);
  },
}));

import { submitBuyerKyc, reviewBuyerKyc, listPendingKycBusinesses } from './buyerKyc';

describe('buyer KYC', () => {
  beforeEach(() => {
    fakeRows.length = 0;
    fakeUpdates.length = 0;
    fakeAudits.length = 0;
  });

  it('submitBuyerKyc resets kycLevel to none and writes audit', async () => {
    fakeRows.push({ id: 'b1', countryCode: 'US', taxId: 'TX-1' });
    await submitBuyerKyc({
      env: {} as Env,
      businessId: 'b1',
      level: 'enhanced',
      documentUrls: ['https://docs.example/a.pdf'],
      submittedBy: 'u1',
    });
    expect(fakeUpdates[0]!.values).toMatchObject({ kycLevel: 'none', kycVerifiedAt: null, kycVerifiedBy: null });
    const audit = fakeAudits.find((a) => a.action === 'cross_border.buyer_kyc_submitted');
    expect(audit).toBeTruthy();
    expect(audit.metadata).toMatchObject({ level: 'enhanced', documentCount: 1 });
  });

  it('submitBuyerKyc throws NOT_FOUND when business missing', async () => {
    let thrown: any;
    try {
      await submitBuyerKyc({
        env: {} as Env,
        businessId: 'missing',
        level: 'basic',
        documentUrls: ['https://x/y.pdf'],
        submittedBy: 'u1',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.status).toBe(404);
  });

  it('reviewBuyerKyc approve sets level + verified metadata', async () => {
    fakeRows.push({ id: 'b1', countryCode: 'US', kycLevel: 'none' });
    await reviewBuyerKyc({
      env: {} as Env,
      businessId: 'b1',
      decision: 'approve',
      level: 'enhanced',
      adminUserId: 'admin1',
    });
    expect(fakeUpdates[0]!.values).toMatchObject({ kycLevel: 'enhanced', kycVerifiedBy: 'admin1' });
    expect(typeof fakeUpdates[0]!.values.kycVerifiedAt).toBe('number');
    const audit = fakeAudits.find((a) => a.action === 'cross_border.buyer_kyc_reviewed');
    expect(audit.metadata).toMatchObject({ decision: 'approve', level: 'enhanced' });
  });

  it('reviewBuyerKyc reject keeps kycLevel=none', async () => {
    fakeRows.push({ id: 'b1', countryCode: 'US', kycLevel: 'none' });
    await reviewBuyerKyc({
      env: {} as Env,
      businessId: 'b1',
      decision: 'reject',
      adminUserId: 'admin1',
    });
    expect(fakeUpdates[0]!.values).toMatchObject({ kycLevel: 'none' });
  });

  it('listPendingKycBusinesses includes domestic LK too', async () => {
    fakeRows.push({ id: 'b1', countryCode: 'US', kycLevel: 'none' });
    fakeRows.push({ id: 'b2', countryCode: 'LK', kycLevel: 'none' });
    fakeRows.push({ id: 'b3', countryCode: 'GB', kycLevel: 'none' });
    const rows = (await listPendingKycBusinesses({} as Env)) as any[];
    expect(rows.map((r) => r.id).sort()).toEqual(['b1', 'b2', 'b3']);
  });

  it('submitBuyerKyc accepts domestic LK business', async () => {
    fakeRows.push({ id: 'bLK', countryCode: 'LK', taxId: 'TAX-1' });
    await submitBuyerKyc({
      env: {} as Env,
      businessId: 'bLK',
      level: 'basic',
      documentUrls: ['https://docs.example/d.pdf'],
      submittedBy: 'u1',
    });
    expect(fakeUpdates[0]!.values).toMatchObject({ kycLevel: 'none', kycVerifiedAt: null, kycVerifiedBy: null });
  });
});
