import { describe, it, expect } from 'vitest';
import { requiredFields, shipperResponsibility, INCOTERMS } from './incoterms';

describe('INCOTERMS', () => {
  it('lists 5 terms', () => {
    expect(INCOTERMS).toEqual(['EXW', 'FOB', 'CIF', 'DDP', 'DDU']);
  });
});

describe('requiredFields', () => {
  it('EXW requires commercial invoice only', () => {
    expect(requiredFields('EXW')).toEqual(['commercialInvoiceNo']);
  });
  it('FOB requires shipping cost + invoice', () => {
    const f = requiredFields('FOB');
    expect(f).toContain('declaredShippingCostCents');
    expect(f).toContain('commercialInvoiceNo');
  });
  it('CIF requires shipping cost + invoice', () => {
    const f = requiredFields('CIF');
    expect(f).toContain('declaredShippingCostCents');
    expect(f).toContain('commercialInvoiceNo');
  });
  it('DDP requires COO', () => {
    expect(requiredFields('DDP')).toContain('coo');
  });
  it('DDU requires shipping + invoice', () => {
    const f = requiredFields('DDU');
    expect(f).toContain('declaredShippingCostCents');
    expect(f).toContain('commercialInvoiceNo');
  });
});

describe('shipperResponsibility', () => {
  it('EXW: shipper covers nothing', () => {
    expect(shipperResponsibility('EXW')).toEqual([]);
  });
  it('DDP: shipper covers duties + freight + insurance', () => {
    const r = shipperResponsibility('DDP');
    expect(r).toContain('duties');
    expect(r).toContain('freight_to_destination');
  });
});