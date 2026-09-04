export function formatLKR(cents: number): string {
  return 'LKR ' + (cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
