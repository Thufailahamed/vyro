import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SupplierStarsLine } from '../../src/reviews/SupplierStarsLine';

describe('SupplierStarsLine', () => {
  it('renders nothing before data loads', () => {
    const html = renderToStaticMarkup(createElement(SupplierStarsLine, { supplierId: 's1' }));
    expect(html).toBe('');
  });
});
