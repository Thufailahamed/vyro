import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SupplierHero } from '../../src/storefront/SupplierHero';
import { SupplierProductGrid } from '../../src/storefront/SupplierProductGrid';

describe('SupplierHero', () => {
  it('renders name + city + verified', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'Fresh Dairy',
        city: 'Colombo',
        verificationStatus: 'verified',
        ratingAvg: 4.5,
        ratingCount: 12,
        email: 'dairy@example.com',
      }),
    );
    expect(html).toMatch(/Fresh Dairy/);
    expect(html).toMatch(/Colombo/);
    expect(html).toMatch(/Verified/);
  });
  it('hides verification when not verified', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'X',
        city: null,
        verificationStatus: 'pending',
        ratingAvg: null,
        ratingCount: 0,
        email: null,
      }),
    );
    expect(html).not.toMatch(/Verified/);
  });
});

describe('SupplierProductGrid', () => {
  it('renders empty state when no offers', () => {
    const html = renderToStaticMarkup(createElement(SupplierProductGrid, { offers: [] }));
    expect(html).toMatch(/No published products/);
  });
  it('renders product cards', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null,
        createElement(SupplierProductGrid, {
          offers: [
            {
              id: 'o1',
              productId: 'p1',
              productName: 'Milk',
              productImage: null,
              unit: 'L',
              packSize: '1L',
              priceCents: 50000,
              leadTimeDays: 1,
            },
          ],
        }),
      ),
    );
    expect(html).toMatch(/Milk/);
  });
});
