export function formatLKR(cents: number): string {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function lkrToCents(rupees: number): number {
  return Math.round(rupees * 100);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
