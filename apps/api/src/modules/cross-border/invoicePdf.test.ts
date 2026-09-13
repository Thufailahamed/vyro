import { describe, it, expect } from 'vitest';
import { renderCommercialInvoice, renderPackingList, renderCertificateOfOrigin } from './invoicePdf';

describe('renderCommercialInvoice', () => {
  it('returns a non-empty PDF buffer with %PDF header', async () => {
    const buf = await renderCommercialInvoice(
      { poNumber: 'PO-1', totalCents: 500000, currency: 'LKR', incoterms: 'CIF' },
      [{ name: 'Coffee 1kg', hsCode: '0901.21', qty: 10, unitPriceCents: 50000 }],
      { name: 'LK Roasters', taxId: 'TAX-1', address: 'Colombo' },
      { name: 'US Buyer Inc', countryCode: 'US', taxId: 'EIN-1', address: 'NYC' },
    );
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(buf.slice(0, 5))).toBe('%PDF-');
  });
});

describe('renderPackingList', () => {
  it('returns a non-empty PDF buffer', async () => {
    const buf = await renderPackingList(
      { poNumber: 'PO-1', totalCents: 500000, currency: 'LKR' },
      [{ name: 'Coffee 1kg', hsCode: '0901.21', qty: 10, unitPriceCents: 50000 }],
      { name: 'LK', address: 'Colombo' },
      { name: 'US', countryCode: 'US', address: 'NYC' },
    );
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(buf.slice(0, 5))).toBe('%PDF-');
  });
});

describe('renderCertificateOfOrigin', () => {
  it('returns a non-empty PDF buffer', async () => {
    const buf = await renderCertificateOfOrigin(
      { poNumber: 'PO-1', totalCents: 500000, currency: 'LKR' },
      { name: 'LK', address: 'Colombo' },
      { name: 'US', countryCode: 'US', address: 'NYC' },
      'LK',
    );
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});