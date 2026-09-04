import { describe, expect, it } from 'vitest';
import { supplierAnalyticsQuery, adminAnalyticsQuery } from '../src/analytics';

describe('analytics schemas', () => {
  it('supplier requires valid uuid for supplierId when present', () => {
    expect(supplierAnalyticsQuery.safeParse({ supplierId: 'not-a-uuid' }).success).toBe(false);
    expect(supplierAnalyticsQuery.safeParse({ range: '30d' }).success).toBe(true);
  });
  it('admin rejects extra keys', () => {
    expect(adminAnalyticsQuery.safeParse({ range: '7d', kind: 'admin' }).success).toBe(false);
  });
});
