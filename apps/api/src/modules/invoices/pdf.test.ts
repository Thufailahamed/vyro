import { describe, it, expect } from 'vitest';
import { renderInvoicePdf } from './pdf';

describe('renderInvoicePdf', () => {
  it('renders a receipt with a %PDF header', async () => {
    const buf = await renderInvoicePdf({
      invoice: {
        number: 'RCP-2026-0001',
        type: 'receipt',
        currency: 'LKR',
        issuedAt: Date.now(),
        subtotalCents: 100000,
        vatCents: 18000,
        ssclCents: 0,
        totalCents: 118000,
        supplierVatNo: 'VAT-1',
        buyerTaxId: 'T-2',
      },
      items: [{ description: 'Rice 5kg', quantity: 10, unitCents: 10000, lineTotalCents: 100000 }],
      business: { name: 'Buyer Ltd' },
      supplier: { name: 'Mill Ltd' },
      po: { poNumber: 'PO-1' },
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(new Uint8Array(buf).slice(0, 5))).toBe('%PDF-');
  });

  it('renders credit notes too', async () => {
    const buf = await renderInvoicePdf({
      invoice: {
        number: 'CN-2026-0001',
        type: 'credit_note',
        currency: 'LKR',
        issuedAt: Date.now(),
        subtotalCents: 5000,
        vatCents: 0,
        ssclCents: 0,
        totalCents: 5000,
        supplierVatNo: null,
        buyerTaxId: null,
      },
      items: [{ description: 'Damaged units', quantity: 1, unitCents: 5000, lineTotalCents: 5000 }],
      business: { name: 'Buyer Ltd' },
      supplier: { name: 'Mill Ltd' },
      po: { poNumber: 'PO-2' },
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});
