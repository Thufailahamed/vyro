/**
 * Sri Lanka indirect taxes on supplier invoices.
 *
 * Catalog prices on Vyro are tax-inclusive: the buyer pays exactly the order
 * total, and the invoice breaks out the tax already contained in it. That keeps
 * payments, ledger and reconciliation untouched while producing a compliant
 * tax invoice for VAT-registered suppliers.
 *
 * SSCL (Social Security Contribution Levy) is part of the VAT base, so
 *   gross = net × (1 + sscl) × (1 + vat).
 *
 * Rates are basis points. Confirm them with the finance team when the IRD
 * changes rates; they live in one place on purpose.
 */
export const LK_TAX_RATES = {
  vatBps: 1800, // 18% VAT
  ssclBps: 250, // 2.5% SSCL
} as const;

export interface TaxRegistration {
  vatRegistered: boolean;
  ssclRegistered: boolean;
}

export interface TaxBreakdown {
  /** Value excluding taxes. */
  netCents: number;
  ssclCents: number;
  vatCents: number;
  /** ssclCents + vatCents. */
  taxCents: number;
  /** Always equals the input gross, so rounding never changes what was paid. */
  grossCents: number;
  vatBps: number;
  ssclBps: number;
}

export function extractInclusiveTax(
  grossCents: number,
  reg: TaxRegistration,
  rates: { vatBps: number; ssclBps: number } = LK_TAX_RATES,
): TaxBreakdown {
  const gross = Math.max(0, Math.round(grossCents));
  const vatBps = reg.vatRegistered ? rates.vatBps : 0;
  const ssclBps = reg.ssclRegistered ? rates.ssclBps : 0;
  const factor = (1 + ssclBps / 10_000) * (1 + vatBps / 10_000);
  const netCents = Math.round(gross / factor);
  const ssclCents = Math.round((netCents * ssclBps) / 10_000);
  // VAT absorbs rounding so the three parts always sum to the gross exactly.
  const vatCents = gross - netCents - ssclCents;
  return {
    netCents,
    ssclCents,
    vatCents,
    taxCents: ssclCents + vatCents,
    grossCents: gross,
    vatBps,
    ssclBps,
  };
}
