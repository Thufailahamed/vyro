/** Price-watch: compare recent vs prior window averages. Pure, no IO. */
export function priceWatchMove(input: {
  recentAvg: number;
  recentN: number;
  priorAvg: number;
  priorN: number;
}): { pct: number } | null {
  if (input.recentN < 2 || input.priorN < 2 || input.priorAvg === 0) return null;
  const pct = Math.round(((input.recentAvg - input.priorAvg) / input.priorAvg) * 100);
  if (Math.abs(pct) < 5) return null;
  return { pct };
}
