/**
 * Centralized minor-unit money utilities for VYRO financials.
 *
 * RULES (enforced across the subsystem):
 * - All persisted/calculated amounts are integers in minor units (cents for LKR).
 * - NEVER use floating-point arithmetic for financial calculations.
 * - All financial math happens server-side; the frontend is display-only.
 * - Every monetary record carries its currency (default LKR).
 *
 * Conversions to major units (parseFloat/toFixed) are ONLY permitted at
 * provider boundaries (e.g. PayHere requires "1250.50" strings) and in
 * display formatters — never for arithmetic.
 */

export const DEFAULT_CURRENCY = 'LKR';

/** Assert a value is a safe non-negative integer minor-unit amount. */
export function assertCents(value: number, field = 'amountCents'): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer (minor units)`);
  }
}

/** Assert a positive minor-unit amount. */
export function assertPositiveCents(value: number, field = 'amountCents'): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer (minor units)`);
  }
}

export function formatLKR(cents: number): string {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Display formatter with 2dp (Rs. 1,250.50). Display-only, not for math. */
export function formatMoney(cents: number, currency = DEFAULT_CURRENCY): string {
  try {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function lkrToCents(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Parse a major-unit decimal string (e.g. "1250.50") into minor units using
 * string manipulation only — no float math. Used at provider boundaries.
 */
export function majorToCents(major: string): number {
  const m = /^(-?\d+)(?:\.(\d{1,3}))?$/.exec(major.trim());
  if (!m) throw new Error(`Invalid monetary value: ${major}`);
  const sign = m[1]!.startsWith('-') ? -1 : 1;
  const whole = Math.abs(parseInt(m[1]!, 10));
  const fracRaw = (m[2] ?? '').padEnd(2, '0').slice(0, 2);
  const frac = fracRaw ? parseInt(fracRaw, 10) : 0;
  const third = m[2] && m[2].length > 2 ? parseInt(m[2][2]!, 10) : 0;
  let cents = whole * 100 + frac;
  if (third >= 5) cents += 1;
  return sign * cents;
}

/** Render minor units as a 2dp major-unit string for providers. No float math. */
export function centsToMajor(cents: number): string {
  assertCents(Math.abs(cents), 'cents');
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const whole = Math.floor(a / 100);
  const frac = String(a % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

export function sumCents(values: readonly number[]): number {
  let acc = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new Error('sumCents encountered non-integer amount');
    acc += v;
    if (!Number.isSafeInteger(acc)) throw new Error('sumCents overflow');
  }
  return acc;
}

export function addCents(a: number, b: number): number {
  return sumCents([a, b]);
}

export function subCents(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new Error('subCents requires integer minor units');
  }
  const out = a - b;
  if (!Number.isSafeInteger(out)) throw new Error('subCents overflow');
  return out;
}

/**
 * Percentage-of-amount in basis points, integer math with half-up rounding.
 * mulBps(100000, 500) === 5000 (5% of Rs.1000.00).
 */
export function mulBps(amountCents: number, bps: number): number {
  assertCents(amountCents, 'amountCents');
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 100_000) {
    throw new Error('bps must be an integer between 0 and 100000');
  }
  return Math.floor((amountCents * bps + 5000) / 10000);
}

/**
 * Pro-rata share: round(amountCents * numerator / denominator), integer math.
 * Used for fee/refund splits so allocations always sum correctly.
 */
export function proRata(amountCents: number, numerator: number, denominator: number): number {
  assertCents(amountCents, 'amountCents');
  if (!Number.isSafeInteger(numerator) || numerator < 0) throw new Error('proRata numerator invalid');
  if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('proRata denominator invalid');
  return Math.floor((amountCents * numerator + Math.floor(denominator / 2)) / denominator);
}

/**
 * Split an integer amount into per-recipient shares that sum EXACTLY to the
 * total (largest-remainder on integer math). No rupees are created/destroyed.
 */
export function allocateCents(totalCents: number, shares: readonly number[]): number[] {
  assertCents(totalCents, 'totalCents');
  if (shares.length === 0) return [];
  const weightTotal = sumCents(shares.map((s) => {
    if (!Number.isSafeInteger(s) || s < 0) throw new Error('allocateCents weights must be non-negative integers');
    return s;
  }));
  if (weightTotal === 0) return shares.map(() => 0);
  const out = shares.map((w) => Math.floor((totalCents * w) / weightTotal));
  let remainder = totalCents - sumCents(out);
  const order = shares
    .map((w, i) => ({ i, rem: (totalCents * w) % weightTotal }))
    .sort((a, b) => b.rem - a.rem);
  let k = 0;
  while (remainder > 0) {
    out[order[k % order.length]!.i]! += 1;
    remainder -= 1;
    k += 1;
  }
  return out;
}

/**
 * Customer-total pipeline (integer math):
 *   ITEM SUBTOTAL + DELIVERY + TAX - DISCOUNT = CUSTOMER TOTAL
 */
export function customerTotalCents(input: {
  itemSubtotalCents: number;
  deliveryCents?: number;
  taxCents?: number;
  discountCents?: number;
}): number {
  const { itemSubtotalCents, deliveryCents = 0, taxCents = 0, discountCents = 0 } = input;
  for (const [v, f] of [[itemSubtotalCents, 'itemSubtotalCents'], [deliveryCents, 'deliveryCents'], [taxCents, 'taxCents'], [discountCents, 'discountCents']] as const) {
    assertCents(v, f);
  }
  if (discountCents > itemSubtotalCents + deliveryCents + taxCents) {
    throw new Error('discount exceeds gross total');
  }
  return itemSubtotalCents + deliveryCents + taxCents - discountCents;
}

/**
 * Supplier-net pipeline (integer math):
 *   SUPPLIER GROSS - COMMISSION - SUPPLIER FEES +/- ADJUSTMENTS - REFUNDS
 *   = SUPPLIER NET EARNINGS
 */
export function supplierNetCents(input: {
  grossCents: number;
  commissionCents: number;
  supplierFeeCents?: number;
  adjustmentCents?: number;
  refundCents?: number;
}): number {
  const { grossCents, commissionCents, supplierFeeCents = 0, adjustmentCents = 0, refundCents = 0 } = input;
  for (const [v, f] of [[grossCents, 'grossCents'], [commissionCents, 'commissionCents'], [supplierFeeCents, 'supplierFeeCents'], [refundCents, 'refundCents']] as const) {
    assertCents(v, f);
  }
  if (!Number.isSafeInteger(adjustmentCents)) throw new Error('adjustmentCents must be an integer');
  const net = grossCents - commissionCents - supplierFeeCents + adjustmentCents - refundCents;
  if (!Number.isSafeInteger(net)) throw new Error('supplier net overflow');
  return net;
}

/** Remaining refundable balance for a paid amount. */
export function refundableBalanceCents(paidCents: number, refundedCents: number): number {
  assertCents(paidCents, 'paidCents');
  assertCents(refundedCents, 'refundedCents');
  if (refundedCents > paidCents) throw new Error('refunded exceeds paid');
  return paidCents - refundedCents;
}
