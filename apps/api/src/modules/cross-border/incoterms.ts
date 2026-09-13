export const INCOTERMS = ['EXW', 'FOB', 'CIF', 'DDP', 'DDU'] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export type CrossBorderField = 'declaredShippingCostCents' | 'commercialInvoiceNo' | 'coo';

// Per ICC 2020 Incoterms rules. DDP/DDU: shipper covers shipping. CIF: shipper
// covers cost + insurance. FOB: shipper covers freight to port. EXW: buyer
// covers from origin warehouse.
export function requiredFields(incoterm: Incoterm): CrossBorderField[] {
  switch (incoterm) {
    case 'EXW':
      return ['commercialInvoiceNo'];
    case 'FOB':
      return ['declaredShippingCostCents', 'commercialInvoiceNo'];
    case 'CIF':
      return ['declaredShippingCostCents', 'commercialInvoiceNo'];
    case 'DDP':
      return ['declaredShippingCostCents', 'commercialInvoiceNo', 'coo'];
    case 'DDU':
      return ['declaredShippingCostCents', 'commercialInvoiceNo'];
  }
}

export function shipperResponsibility(incoterm: Incoterm): string[] {
  switch (incoterm) {
    case 'EXW':
      return [];
    case 'FOB':
      return ['freight_to_port'];
    case 'CIF':
      return ['freight_to_port', 'insurance'];
    case 'DDP':
      return ['freight_to_destination', 'duties', 'insurance'];
    case 'DDU':
      return ['freight_to_destination', 'insurance'];
  }
}