import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SupplierReviewsPanel } from '../../src/reviews/SupplierReviewsPanel';

describe('SupplierReviewsPanel', () => {
  it('renders without throwing', () => {
    const html = renderToStaticMarkup(createElement(SupplierReviewsPanel, { supplierId: 's1' }));
    expect(html).toBeTruthy();
  });
});
