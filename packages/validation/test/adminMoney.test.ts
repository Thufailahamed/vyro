import { describe, expect, it } from 'vitest';
import {
  adminRefundRejectBody,
  adminPayoutBatchCreateBody,
  adminInvoiceOverrideBody,
  adminChargebackResolveBody,
  adminLedgerSummaryQuery,
} from '../src/adminMoney';

describe('adminRefundRejectBody', () => {
  it('requires reason', () => {
    expect(() => adminRefundRejectBody.parse({})).toThrow();
  });
  it('accepts valid reason', () => {
    expect(() => adminRefundRejectBody.parse({ reason: 'duplicate' })).not.toThrow();
  });
});

describe('adminPayoutBatchCreateBody', () => {
  it('accepts empty (all suppliers)', () => {
    expect(() => adminPayoutBatchCreateBody.parse({})).not.toThrow();
  });
  it('accepts supplierIds list', () => {
    const r = adminPayoutBatchCreateBody.parse({ supplierIds: ['s-1', 's-2'] });
    expect(r.supplierIds?.length).toBe(2);
  });
  it('rejects empty supplierIds', () => {
    expect(() => adminPayoutBatchCreateBody.parse({ supplierIds: [] })).toThrow();
  });
});

describe('adminInvoiceOverrideBody', () => {
  it('requires note', () => {
    expect(() => adminInvoiceOverrideBody.parse({})).toThrow();
  });
});

describe('adminChargebackResolveBody', () => {
  it('accepts empty', () => {
    expect(() => adminChargebackResolveBody.parse({})).not.toThrow();
  });
  it('accepts notes + refundId', () => {
    expect(() =>
      adminChargebackResolveBody.parse({ notes: 'done', refundId: 'r-1' }),
    ).not.toThrow();
  });
});

describe('adminLedgerSummaryQuery', () => {
  it('accepts empty', () => {
    expect(() => adminLedgerSummaryQuery.parse({})).not.toThrow();
  });
  it('coerces numbers', () => {
    const r = adminLedgerSummaryQuery.parse({ from: '1000', to: '2000' });
    expect(r.from).toBe(1000);
  });
});
