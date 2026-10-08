import { describe, expect, it } from 'vitest';
import { normalizeInvoiceAlias, planInvoiceAliasMatches } from './aliases';

describe('normalizeInvoiceAlias', () => {
  it('normalizes case, punctuation, and spacing but preserves pack-size digits', () => {
    expect(normalizeInvoiceAlias('  WHT.   SGR—1KG! ')).toBe('wht sgr 1kg');
    expect(normalizeInvoiceAlias('Milk Powder 400g')).toBe('milk powder 400g');
  });

  it('applies Unicode compatibility normalization and skips empty/overlength aliases', () => {
    expect(normalizeInvoiceAlias('Ｃａｆé 1kg')).toBe('café 1kg');
    expect(normalizeInvoiceAlias('!!!')).toBe('');
    expect(normalizeInvoiceAlias('x'.repeat(201))).toBe('');
  });
});

describe('planInvoiceAliasMatches', () => {
  const invoice = [
    { description: 'WHT. SGR 1KG', quantity: 1, unitPriceCents: 100, totalCents: 100 },
  ];

  it('matches an exact normalized alias only to its product on the current PO', () => {
    const po = [
      { id: 'poi-1', productId: 'product-sugar', productNameSnapshot: 'White Sugar 1kg', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
      { id: 'poi-2', productId: 'product-rice', productNameSnapshot: 'Rice 5kg', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ];
    expect(planInvoiceAliasMatches(po, invoice, [{ normalizedAlias: 'wht sgr 1kg', productId: 'product-sugar' }])).toEqual([
      { invoiceItemIndex: 0, poItemId: 'poi-1', reason: 'Previously confirmed supplier alias.' },
    ]);
  });

  it('ignores an alias whose product is absent from the PO', () => {
    const po = [
      { id: 'poi-rice', productId: 'product-rice', productNameSnapshot: 'Rice 5kg', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ];
    expect(planInvoiceAliasMatches(po, invoice, [{ normalizedAlias: 'wht sgr 1kg', productId: 'product-sugar' }])).toEqual([]);
  });

  it('does not choose when duplicate PO rows share the aliased product', () => {
    const po = [
      { id: 'poi-sugar-a', productId: 'product-sugar', productNameSnapshot: 'White Sugar 1kg A', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
      { id: 'poi-sugar-b', productId: 'product-sugar', productNameSnapshot: 'White Sugar 1kg B', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ];
    expect(planInvoiceAliasMatches(po, invoice, [{ normalizedAlias: 'wht sgr 1kg', productId: 'product-sugar' }])).toEqual([]);
  });

  it('reserves alias PO rows one-to-one across repeated invoice descriptions', () => {
    const po = [
      { id: 'poi-sugar-a', productId: 'product-sugar', productNameSnapshot: 'White Sugar 1kg', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ];
    const repeatedInvoice = [invoice[0]!, invoice[0]!];
    expect(planInvoiceAliasMatches(po, repeatedInvoice, [{ normalizedAlias: 'wht sgr 1kg', productId: 'product-sugar' }])).toEqual([
      { invoiceItemIndex: 0, poItemId: 'poi-sugar-a', reason: 'Previously confirmed supplier alias.' },
    ]);
  });
});
