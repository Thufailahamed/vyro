import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoicePoProductSelect } from '../src/components/invoices/InvoicePoProductSelect';

describe('InvoicePoProductSelect', () => {
  it('renders unmapped and only the supplied PO product candidates', () => {
    const html = renderToStaticMarkup(createElement(InvoicePoProductSelect, {
      value: 'product-sugar',
      candidates: [
        { productId: 'product-rice', productName: 'Basmati Rice 5kg', unit: 'bag' },
        { productId: 'product-sugar', productName: 'White Sugar 1kg', unit: 'pack' },
      ],
      onChange: () => {},
    }));
    expect(html).toContain('Unmapped');
    expect(html).toContain('Basmati Rice 5kg');
    expect(html).toContain('White Sugar 1kg');
    expect(html).toContain('value="product-sugar" selected');
  });

  it('renders nothing when the upload has no PO product candidates', () => {
    const html = renderToStaticMarkup(createElement(InvoicePoProductSelect, {
      value: null,
      candidates: [],
      onChange: () => {},
    }));
    expect(html).toBe('');
  });
});
