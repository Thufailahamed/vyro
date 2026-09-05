import { describe, expect, it } from 'vitest';
import {
  adminAbuseReportsListQuery,
  adminAbuseReportNoteBody,
  adminAbuseReportResolveBody,
  adminKycDecisionBody,
  adminKycCreateBody,
} from '../src/adminTrustSafety';

describe('adminAbuseReportsListQuery', () => {
  it('accepts empty', () => {
    expect(adminAbuseReportsListQuery.safeParse({}).success).toBe(true);
  });
  it('rejects unknown key', () => {
    expect(adminAbuseReportsListQuery.safeParse({ foo: 'bar' }).success).toBe(false);
  });
  it('clamps limit', () => {
    expect(adminAbuseReportsListQuery.safeParse({ limit: 999 }).success).toBe(false);
  });
});

describe('adminAbuseReportNoteBody', () => {
  it('requires note', () => {
    expect(adminAbuseReportNoteBody.safeParse({}).success).toBe(false);
  });
  it('accepts note', () => {
    expect(adminAbuseReportNoteBody.safeParse({ note: 'investigating' }).success).toBe(true);
  });
});

describe('adminAbuseReportResolveBody', () => {
  it('requires resolution enum', () => {
    expect(adminAbuseReportResolveBody.safeParse({ resolution: 'bogus' }).success).toBe(false);
  });
  it('accepts resolved', () => {
    expect(adminAbuseReportResolveBody.safeParse({ resolution: 'resolved' }).success).toBe(true);
  });
});

describe('adminKycDecisionBody', () => {
  it('accepts approved', () => {
    expect(adminKycDecisionBody.safeParse({ decision: 'approved' }).success).toBe(true);
  });
  it('rejects unknown decision', () => {
    expect(adminKycDecisionBody.safeParse({ decision: 'maybe' }).success).toBe(false);
  });
});

describe('adminKycCreateBody', () => {
  it('requires userId', () => {
    expect(adminKycCreateBody.safeParse({}).success).toBe(false);
  });
  it('accepts userId', () => {
    expect(adminKycCreateBody.safeParse({ userId: 'u-1' }).success).toBe(true);
  });
});
