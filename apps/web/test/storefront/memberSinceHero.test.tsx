import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SupplierHero } from '../../src/storefront/SupplierHero';

describe('SupplierHero member since', () => {
  it('renders generic badge alongside TrustSEAL when both present', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'Fresh Dairy',
        city: 'Colombo',
        verificationStatus: 'verified',
        ratingAvg: 4.5,
        ratingCount: 12,
        email: null,
        trustSealed: true,
        trustSealExpiresAt: Date.now() + 1000,
        memberSinceYear: 2024,
        supplierSinceYear: 2021,
        supplierMemberYears: 5,
        supplierSinceDate: new Date('2021-06-15T00:00:00Z').toISOString(),
      }),
    );
    expect(html).toMatch(/Fresh Dairy/);
    expect(html).toMatch(/TRUSTSEAL/);
    expect(html).toMatch(/MEMBER SINCE 2021/);
    expect(html).toMatch(/5 yrs/);
  });
  it('renders generic badge even without TrustSEAL', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'Free Supplier',
        city: null,
        verificationStatus: 'verified',
        ratingAvg: null,
        ratingCount: 0,
        email: null,
        trustSealed: false,
        supplierSinceYear: 2025,
        supplierMemberYears: 1,
        supplierSinceDate: null,
      }),
    );
    expect(html).toMatch(/MEMBER SINCE 2025/);
    expect(html).not.toMatch(/TRUSTSEAL/);
  });
  it('hides generic badge when tenure is null', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'No Tenure',
        city: null,
        verificationStatus: 'verified',
        ratingAvg: null,
        ratingCount: 0,
        email: null,
        supplierSinceYear: null,
        supplierMemberYears: null,
        supplierSinceDate: null,
      }),
    );
    expect(html).not.toMatch(/MEMBER SINCE/);
  });
});
