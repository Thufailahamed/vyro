/** Price anomaly: cheapest live offer vs purchase history median. Pure, no IO. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

export function detectAnomaly(
  history: number[],
  liveCheapest: number,
): { flagged: boolean; median: number; ratio: number } {
  const med = median(history);
  const ratio = med === 0 ? 0 : liveCheapest / med;
  return { flagged: ratio > 1.25, median: med, ratio: Math.round(ratio * 100) / 100 };
}
