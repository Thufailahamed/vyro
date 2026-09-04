export function formatLKR(cents: number): string {
  return (
    'Rs. ' +
    (cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function formatCompactLKR(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `Rs. ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `Rs. ${(v / 1_000).toFixed(1)}K`;
  return formatLKR(cents);
}

export function greetingForNow(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
